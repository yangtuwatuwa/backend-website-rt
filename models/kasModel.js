import db from "../config/sqlconfig.js";
import { initIplBillingTables } from "../utils/migrateIplBills.js";

let tablesInitialized = false;
async function ensureTables() {
    if (!tablesInitialized) {
        try {
            await initIplBillingTables();
            tablesInitialized = true;
        } catch (e) {
            console.error("Auto-init kas tables error:", e.message);
        }
    }
}

/**
 * Buat entri sumbangan/iuran Kas baru
 */
export async function createKasContribution({
    familyId,
    residentId, // Fallback parameter
    amount,
    category,
    description = "-",
    channel = 'transfer',
    proofUrl = null,
    status = 'pending',
    rejectReason = null,
    recordedBy = null,
    verifiedBy = null,
    verifiedAt = null
}, connection = null) {
    await ensureTables();
    const client = connection || db;
    const targetFamilyId = familyId || residentId;
    const sql = `
        INSERT INTO kas_contributions (
            family_id, amount, category, description, channel, proof_url,
            status, reject_reason, recorded_by, verified_by, verified_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    try {
        const [result] = await client.execute(sql, [
            targetFamilyId,
            amount,
            category,
            description,
            channel,
            proofUrl,
            status,
            rejectReason,
            recordedBy,
            verifiedBy,
            verifiedAt
        ]);
        return result;
    } catch (err) {
        console.error("error createKasContribution:", err);
        throw err;
    }
}

/**
 * Ambil entri kas_contributions berdasarkan ID
 */
export async function getKasContributionById(id, connection = null) {
    await ensureTables();
    const client = connection || db;
    // TODO: alias `resident_name`/`resident_nik` bersifat sementara untuk backward-compatibility.
    // Hapus setelah frontend dipastikan sudah pindah ke `kepala_keluarga_nama`/`kepala_keluarga_nik`.
    const sql = `
        SELECT k.*,
               f.no_kk,
               w.nama AS kepala_keluarga_nama,
               w.nama AS resident_name,
               w.nik AS kepala_keluarga_nik,
               w.nik AS resident_nik,
               rec.username AS recorded_by_username,
               ver.username AS verified_by_username
        FROM kas_contributions k
        JOIN family f ON k.family_id = f.id
        LEFT JOIN warga w ON f.kepala_keluarga_id = w.id
        LEFT JOIN acount rec ON k.recorded_by = rec.id
        LEFT JOIN acount ver ON k.verified_by = ver.id
        WHERE k.id = ?
    `;
    try {
        const [rows] = await client.execute(sql, [id]);
        return rows[0] || null;
    } catch (err) {
        console.error("error getKasContributionById:", err);
        throw err;
    }
}

/**
 * Ambil entri kas_contributions dengan Pessimistic Lock (FOR UPDATE)
 */
export async function getKasContributionByIdForUpdate(id, connection) {
    await ensureTables();
    const sql = "SELECT * FROM kas_contributions WHERE id = ? FOR UPDATE";
    try {
        const [rows] = await connection.execute(sql, [id]);
        return rows[0] || null;
    } catch (err) {
        console.error("error getKasContributionByIdForUpdate:", err);
        throw err;
    }
}

/**
 * Ambil daftar iuran Kas yang menunggu verifikasi (Pending)
 */
export async function getPendingKasContributions({ limit = 50, offset = 0 } = {}) {
    await ensureTables();
    // TODO: alias `resident_name`/`resident_nik` bersifat sementara untuk backward-compatibility.
    // Hapus setelah frontend dipastikan sudah pindah ke `kepala_keluarga_nama`/`kepala_keluarga_nik`.
    const sql = `
        SELECT k.*,
               f.no_kk,
               w.nama AS kepala_keluarga_nama,
               w.nama AS resident_name,
               w.nik AS kepala_keluarga_nik,
               w.nik AS resident_nik,
               rec.username AS recorded_by_username
        FROM kas_contributions k
        JOIN family f ON k.family_id = f.id
        LEFT JOIN warga w ON f.kepala_keluarga_id = w.id
        LEFT JOIN acount rec ON k.recorded_by = rec.id
        WHERE k.status = 'pending'
        ORDER BY k.created_at ASC
        LIMIT ? OFFSET ?
    `;
    try {
        const [rows] = await db.execute(sql, [String(limit), String(offset)]);
        return rows;
    } catch (err) {
        console.error("error getPendingKasContributions:", err);
        throw err;
    }
}

/**
 * Ambil riwayat sumbangan kas milik seorang warga (resident_id)
 */
export async function getKasContributionsByResident(residentId) {
    await ensureTables();
    // TODO: alias `resident_name` bersifat sementara untuk backward-compatibility.
    // Hapus setelah frontend dipastikan sudah pindah ke `kepala_keluarga_nama`.
    const sql = `
        SELECT k.*,
               f.no_kk,
               w.nama AS kepala_keluarga_nama,
               w.nama AS resident_name,
               ver.username AS verified_by_username
        FROM kas_contributions k
        JOIN family f ON k.family_id = f.id
        LEFT JOIN warga w ON f.kepala_keluarga_id = w.id
        LEFT JOIN acount ver ON k.verified_by = ver.id
        WHERE k.family_id = (SELECT family_id FROM warga WHERE id = ? LIMIT 1)
        ORDER BY k.created_at DESC
    `;
    try {
        const [rows] = await db.execute(sql, [residentId]);
        return rows;
    } catch (err) {
        console.error("error getKasContributionsByResident:", err);
        throw err;
    }
}

/**
 * Ambil riwayat sumbangan kas untuk satu Kartu Keluarga (family_id)
 */
export async function getKasContributionsByFamily(familyId) {
    await ensureTables();
    // TODO: alias `resident_name` bersifat sementara untuk backward-compatibility.
    // Hapus setelah frontend dipastikan sudah pindah ke `kepala_keluarga_nama`.
    const sql = `
        SELECT k.*,
               f.no_kk,
               w.nama AS kepala_keluarga_nama,
               w.nama AS resident_name,
               ver.username AS verified_by_username
        FROM kas_contributions k
        JOIN family f ON k.family_id = f.id
        LEFT JOIN warga w ON f.kepala_keluarga_id = w.id
        LEFT JOIN acount ver ON k.verified_by = ver.id
        WHERE k.family_id = ?
        ORDER BY k.created_at DESC
    `;
    try {
        const [rows] = await db.execute(sql, [familyId]);
        return rows;
    } catch (err) {
        console.error("error getKasContributionsByFamily:", err);
        throw err;
    }
}

/**
 * Ambil daftar audit seluruh iuran Kas (untuk Bendahara & RT)
 */
export async function getKasAuditList({ category, status, channel, limit = 100, offset = 0 } = {}) {
    await ensureTables();
    // TODO: alias `resident_name`/`resident_nik` bersifat sementara untuk backward-compatibility.
    // Hapus setelah frontend dipastikan sudah pindah ke `kepala_keluarga_nama`/`kepala_keluarga_nik`.
    let sql = `
        SELECT k.*,
               f.no_kk,
               w.nama AS kepala_keluarga_nama,
               w.nama AS resident_name,
               w.nik AS kepala_keluarga_nik,
               w.nik AS resident_nik,
               rec.username AS recorded_by_username,
               ver.username AS verified_by_username
        FROM kas_contributions k
        JOIN family f ON k.family_id = f.id
        LEFT JOIN warga w ON f.kepala_keluarga_id = w.id
        LEFT JOIN acount rec ON k.recorded_by = rec.id
        LEFT JOIN acount ver ON k.verified_by = ver.id
        WHERE 1=1
    `;
    const params = [];

    if (category) {
        sql += " AND k.category = ?";
        params.push(category);
    }
    if (status) {
        sql += " AND k.status = ?";
        params.push(status);
    }
    if (channel) {
        sql += " AND k.channel = ?";
        params.push(channel);
    }

    sql += " ORDER BY k.created_at DESC LIMIT ? OFFSET ?";
    params.push(String(limit), String(offset));

    try {
        const [rows] = await db.execute(sql, params);
        return rows;
    } catch (err) {
        console.error("error getKasAuditList:", err);
        throw err;
    }
}

/**
 * Update keputusan verifikasi iuran kas (approved / rejected)
 */
export async function updateKasVerification(id, { status, rejectReason = null, verifiedBy = null, verifiedAt = new Date() }, connection = null) {
    await ensureTables();
    const client = connection || db;
    const sql = `
        UPDATE kas_contributions
        SET status = ?, reject_reason = ?, verified_by = ?, verified_at = ?
        WHERE id = ?
    `;
    try {
        const [result] = await client.execute(sql, [status, rejectReason, verifiedBy, verifiedAt, id]);
        return result;
    } catch (err) {
        console.error("error updateKasVerification:", err);
        throw err;
    }
}
