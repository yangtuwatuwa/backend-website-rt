import pool from "../config/sqlconfig.js";

/**
 * Error bisnis yang dapat dipetakan controller ke status HTTP yang tepat.
 */
export class WargaDeletionError extends Error {
    constructor(status, code, message, details = {}) {
        super(message);
        this.name = "WargaDeletionError";
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

function assertWargaId(wargaId) {
    const id = Number(wargaId);
    if (!Number.isInteger(id) || id <= 0) {
        throw new WargaDeletionError(400, "INVALID_WARGA_ID", "ID warga tidak valid.");
    }
    return id;
}

async function getActiveFamilyAccounts(connection, familyId) {
    // Schema acount yang ada tidak memiliki penanda soft-delete/status aktif.
    // Jadi satu akun yang masih ada dan terikat pada KK dianggap masih aktif; akun harus
    // dihapus melalui endpoint account secara eksplisit terlebih dahulu.
    const [rows] = await connection.execute(
        `SELECT id, username, role
         FROM acount
         WHERE family_id = ?
         FOR UPDATE`,
        [familyId]
    );
    return rows;
}

async function writeDeleteAuditLog(connection, { actorId, actorUsername, ipAddress, userAgent, warga, familyDeleted }) {
    const details = JSON.stringify({
        actor_id: actorId || null,
        warga_id: warga.id,
        warga_nama: warga.nama,
        family_id: warga.family_id,
        family_deleted: familyDeleted,
        timestamp: new Date().toISOString()
    });

    // Audit ditulis pada connection transaksi yang sama supaya delete tanpa audit
    // tidak pernah bisa ter-commit.
    await connection.execute(
        `INSERT INTO access_logs
            (username, event_type, ip_address, user_agent, status, details)
         VALUES (?, 'DELETE_WARGA', ?, ?, 'success', ?)`,
        [actorUsername || `account:${actorId || "unknown"}`, ipAddress || "-", userAgent || "-", details]
    );
}

async function assertFamilyHasNoFinancialHistory(connection, familyId) {
    /*
     * Schema saat ini tidak mempunyai kolom archive/closed untuk bills, payments,
     * atau kas_contributions. Menghapus family sambil mempertahankan history tidak
     * mungkin dilakukan tanpa perubahan schema, karena family_id ber-FK RESTRICT.
     * Maka cleanup terakhir dihentikan dengan aman, bukan menghapus history paksa.
     */
    const [rows] = await connection.execute(
        `SELECT
            (SELECT COUNT(*) FROM bills WHERE family_id = ?) AS bills_total,
            (SELECT COUNT(*) FROM payments WHERE family_id = ?) AS payments_total,
            (SELECT COUNT(*) FROM kas_contributions WHERE family_id = ?) AS kas_total`,
        [familyId, familyId, familyId]
    );
    const history = rows[0];
    if (Number(history.bills_total) + Number(history.payments_total) + Number(history.kas_total) > 0) {
        throw new WargaDeletionError(
            409,
            "FAMILY_HISTORY_REQUIRES_ARCHIVE",
            "KK ini masih memiliki riwayat IPL atau kas. Pengarsipan riwayat memerlukan skema archive yang belum tersedia.",
            history
        );
    }
}

/**
 * Hapus satu warga secara aman.
 *
 * Perilaku normal adalah soft-delete warga. Bila ini merupakan anggota aktif
 * terakhir dalam KK, seluruh warga soft-deleted dari KK tersebut di-hard-delete
 * lalu family dihapus agar FK tidak menghalangi cleanup terakhir.
 */
export async function deleteWarga(wargaId, options = {}) {
    const id = assertWargaId(wargaId);
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // Lock baris warga + family agar dua request delete paralel tidak dapat
        // sama-sama menyimpulkan bahwa mereka adalah anggota terakhir.
        const [wargaRows] = await connection.execute(
            `SELECT w.id, w.nama, w.family_id, w.house_id,
                    f.id AS locked_family_id, f.house_id AS family_house_id,
                    f.kepala_keluarga_id
             FROM warga w
             LEFT JOIN family f ON f.id = w.family_id
             WHERE w.id = ?
               AND (w.status_data IS NULL OR w.status_data IN ('pending', 'diterima'))
             FOR UPDATE`,
            [id]
        );

        if (wargaRows.length === 0) {
            throw new WargaDeletionError(404, "WARGA_NOT_FOUND", "Data warga tidak ditemukan atau sudah dihapus.");
        }

        const warga = wargaRows[0];
        const hasFamily = warga.family_id !== null && warga.locked_family_id !== null;
        const isKepalaKeluarga = hasFamily && Number(warga.kepala_keluarga_id) === id;

        let otherMembers = [];
        if (hasFamily) {
            // Hanya warga aktif yang dihitung sebagai anggota tersisa.
            const [rows] = await connection.execute(
                `SELECT id, nama
                 FROM warga
                 WHERE family_id = ? AND id <> ?
                   AND (status_data IS NULL OR status_data IN ('pending', 'diterima'))
                 ORDER BY id ASC
                 FOR UPDATE`,
                [warga.family_id, id]
            );
            otherMembers = rows;
        }

        if (isKepalaKeluarga) {
            // Pada skema saat ini akun warga adalah akun KK (acount.family_id).
            // Karena itu akun aktif KK merepresentasikan akun kepala keluarga.
            const activeAccounts = await getActiveFamilyAccounts(connection, warga.family_id);
            if (activeAccounts.length > 0) {
                throw new WargaDeletionError(
                    409,
                    "ACTIVE_HEAD_ACCOUNT",
                    "Hapus akun warga ini terlebih dahulu sebelum menghapus data warga.",
                    { accountIds: activeAccounts.map(account => account.id) }
                );
            }

            if (otherMembers.length > 0) {
                // Tidak melakukan auto-promote: Pak RT harus menunjuk pengganti
                // secara eksplisit agar tidak ada pergantian kepala tersembunyi.
                throw new WargaDeletionError(
                    409,
                    "HEAD_REPLACEMENT_REQUIRED",
                    "Tunjuk kepala keluarga pengganti terlebih dahulu sebelum menghapus kepala keluarga ini.",
                    { candidateMembers: otherMembers.map(member => ({ id: member.id, nama: member.nama })) }
                );
            }
        }

        // Semua validasi pemblokir dilakukan sebelum mutasi pertama.
        const [softDeleteResult] = await connection.execute(
            `UPDATE warga
             SET status_data = 'ditolak'
             WHERE id = ?
               AND (status_data IS NULL OR status_data IN ('pending', 'diterima'))`,
            [id]
        );
        if (softDeleteResult.affectedRows !== 1) {
            throw new WargaDeletionError(409, "WARGA_DELETE_RACE", "Data warga berubah saat diproses; silakan coba lagi.");
        }

        let familyDeleted = false;
        if (hasFamily) {
            const [remainingRows] = await connection.execute(
                `SELECT COUNT(*) AS total
                 FROM warga
                 WHERE family_id = ?
                   AND (status_data IS NULL OR status_data IN ('pending', 'diterima'))`,
                [warga.family_id]
            );

            if (Number(remainingRows[0].total) === 0) {
                // Validasi ulang tepat sebelum cleanup. Tidak pernah menghapus akun
                // sebagai side-effect, bahkan pada cascade KK terakhir.
                const activeAccounts = await getActiveFamilyAccounts(connection, warga.family_id);
                if (activeAccounts.length > 0) {
                    throw new WargaDeletionError(
                        409,
                        "ACTIVE_FAMILY_ACCOUNT",
                        "Masih ada akun aktif pada KK ini. Hapus akun tersebut terlebih dahulu sebelum menghapus warga terakhir.",
                        { accountIds: activeAccounts.map(account => account.id) }
                    );
                }

                await assertFamilyHasNoFinancialHistory(connection, warga.family_id);

                // Ini satu-satunya hard-delete warga: semua anggota telah
                // berstatus ditolak, sehingga parent family dapat dihapus tanpa
                // menabrak FK warga.family_id.
                await connection.execute("DELETE FROM warga WHERE family_id = ?", [warga.family_id]);
                await connection.execute("DELETE FROM family WHERE id = ?", [warga.family_id]);

                // Kebijakan rumah: rumah tidak dihapus; dilepas menjadi available
                // agar dapat dipakai/diassign ke KK berikutnya.
                await connection.execute(
                    "UPDATE house SET status = 'available' WHERE id = ?",
                    [warga.family_house_id || warga.house_id]
                );
                familyDeleted = true;
            }
        }

        await writeDeleteAuditLog(connection, {
            actorId: options.actorId,
            actorUsername: options.actorUsername,
            ipAddress: options.ipAddress,
            userAgent: options.userAgent,
            warga,
            familyDeleted
        });

        await connection.commit();
        return {
            deletedId: id,
            nama: warga.nama,
            family_id: warga.family_id,
            mode: familyDeleted ? "family_cascade" : "soft_delete",
            familyDeleted
        };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}
