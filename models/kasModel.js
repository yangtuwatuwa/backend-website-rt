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
    residentId,
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
    const sql = `
        INSERT INTO kas_contributions (
            resident_id, amount, category, description, channel, proof_url,
            status, reject_reason, recorded_by, verified_by, verified_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    try {
        const [result] = await client.execute(sql, [
            residentId,
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
    const sql = `
        SELECT k.*,
               w.nama AS resident_name, w.nik AS resident_nik, w.family_id,
               f.no_kk,
               rec.username AS recorded_by_username,
               ver.username AS verified_by_username
        FROM kas_contributions k
        JOIN warga w ON k.resident_id = w.id
        LEFT JOIN family f ON w.family_id = f.id
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
    const sql = `
        SELECT k.*,
               w.nama AS resident_name, w.nik AS resident_nik, w.family_id,
               f.no_kk,
               rec.username AS recorded_by_username
        FROM kas_contributions k
        JOIN warga w ON k.resident_id = w.id
        LEFT JOIN family f ON w.family_id = f.id
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
    const sql = `
        SELECT k.*,
               w.nama AS resident_name,
               ver.username AS verified_by_username
        FROM kas_contributions k
        JOIN warga w ON k.resident_id = w.id
        LEFT JOIN acount ver ON k.verified_by = ver.id
        WHERE k.resident_id = ?
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
    const sql = `
        SELECT k.*,
               w.nama AS resident_name, w.family_id,
               f.no_kk,
               ver.username AS verified_by_username
        FROM kas_contributions k
        JOIN warga w ON k.resident_id = w.id
        JOIN family f ON w.family_id = f.id
        LEFT JOIN acount ver ON k.verified_by = ver.id
        WHERE w.family_id = ?
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
    let sql = `
        SELECT k.*,
               w.nama AS resident_name, w.nik AS resident_nik, w.family_id,
               f.no_kk,
               rec.username AS recorded_by_username,
               ver.username AS verified_by_username
        FROM kas_contributions k
        JOIN warga w ON k.resident_id = w.id
        LEFT JOIN family f ON w.family_id = f.id
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
