import pool from "../config/sqlconfig.js";

/**
 * Ambil profil kepala keluarga berdasarkan ID akun terautentikasi.
 * Query dimulai dari acount.id agar family_id/warga_id tidak dapat dipilih client.
 */
export async function getProfilSayaByAccountId(accountId, executor = pool) {
    const sql = `
        SELECT
            a.id AS account_id,
            a.username,
            a.email_encrypted,
            a.family_id,
            f.kepala_keluarga_id,
            w.id AS warga_id,
            w.nik,
            w.nama,
            w.jenis_kelamin,
            w.tgl_lahir,
            w.no_hp,
            h.blok AS house_blok,
            h.nomor AS house_nomor,
            h.alamat AS house_alamat,
            h.status AS house_status
        FROM acount a
        LEFT JOIN family f ON f.id = a.family_id
        LEFT JOIN warga w
            ON w.id = f.kepala_keluarga_id
            AND w.family_id = f.id
            AND w.status_data = 'diterima'
        LEFT JOIN house h ON h.id = f.house_id
        WHERE a.id = ? AND a.role = 'warga'
        LIMIT 1
    `;

    const [rows] = await executor.execute(sql, [accountId]);
    return rows[0] || null;
}
