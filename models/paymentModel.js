import db from "../config/sqlconfig.js";
import { initIplBillingTables } from "../utils/migrateIplBills.js";

let tablesInitialized = false;
async function ensureTables() {
    if (!tablesInitialized) {
        try {
            await initIplBillingTables();
            tablesInitialized = true;
        } catch (e) {
            console.error("Auto-init bill tables error:", e.message);
        }
    }
}

/**
 * Buat pencatatan pembayaran baru
 */
export async function createPayment({
    billId,
    residentId,
    amountStated,
    channel,
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
        INSERT INTO payments (
            id, bill_id, resident_id, amount_stated, channel, proof_url, 
            status, reject_reason, recorded_by, verified_by, verified_at
        ) VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    try {
        const [result] = await client.execute(sql, [
            billId,
            residentId,
            amountStated,
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
        console.error("error createPayment:", err);
        throw err;
    }
}

/**
 * Ambil payment berdasarkan ID
 */
export async function getPaymentById(id, connection = null) {
    await ensureTables();
    const client = connection || db;
    const sql = `
        SELECT p.*,
               b.amount AS bill_amount, b.due_date AS bill_due_date, b.status AS bill_status,
               bp.id AS bill_period_id, bp.title AS period_title, bp.period_month, bp.period_year,
               w.nama AS resident_name, w.nik AS resident_nik, w.family_id,
               f.no_kk,
               rec.username AS recorded_by_username,
               ver.username AS verified_by_username
        FROM payments p
        JOIN bills b ON p.bill_id = b.id
        JOIN bill_periods bp ON b.bill_period_id = bp.id
        JOIN warga w ON p.resident_id = w.id
        LEFT JOIN family f ON w.family_id = f.id
        LEFT JOIN acount rec ON p.recorded_by = rec.id
        LEFT JOIN acount ver ON p.verified_by = ver.id
        WHERE p.id = ?
    `;
    try {
        const [rows] = await client.execute(sql, [id]);
        return rows[0] || null;
    } catch (err) {
        console.error("error getPaymentById:", err);
        throw err;
    }
}

/**
 * Ambil payment dengan kunci Pessimistic Lock (FOR UPDATE) dalam transaksi
 */
export async function getPaymentByIdForUpdate(id, connection) {
    await ensureTables();
    const sql = `
        SELECT p.*, b.status AS bill_status, b.amount AS bill_amount, b.bill_period_id
        FROM payments p
        JOIN bills b ON p.bill_id = b.id
        WHERE p.id = ?
        FOR UPDATE
    `;
    try {
        const [rows] = await connection.execute(sql, [id]);
        return rows[0] || null;
    } catch (err) {
        console.error("error getPaymentByIdForUpdate:", err);
        throw err;
    }
}

/**
 * Ambil seluruh riwayat pembayaran untuk satu bill_id tertentu
 */
export async function getPaymentsByBillId(billId) {
    await ensureTables();
    const sql = `
        SELECT p.*,
               rec.username AS recorded_by_username,
               ver.username AS verified_by_username
        FROM payments p
        LEFT JOIN acount rec ON p.recorded_by = rec.id
        LEFT JOIN acount ver ON p.verified_by = ver.id
        WHERE p.bill_id = ?
        ORDER BY p.id DESC
    `;
    try {
        const [rows] = await db.execute(sql, [billId]);
        return rows;
    } catch (err) {
        console.error("error getPaymentsByBillId:", err);
        throw err;
    }
}

/**
 * Cek apakah sebuah tagihan sudah memiliki payment yang berstatus 'approved'
 */
export async function hasApprovedPayment(billId, connection = null) {
    await ensureTables();
    const client = connection || db;
    const sql = "SELECT id FROM payments WHERE bill_id = ? AND status = 'approved' LIMIT 1";
    try {
        const [rows] = await client.execute(sql, [billId]);
        return rows.length > 0;
    } catch (err) {
        console.error("error hasApprovedPayment:", err);
        throw err;
    }
}

/**
 * Ambil daftar pembayaran pending (menunggu verifikasi) untuk Bendahara
 */
export async function getPendingPaymentsList({ limit = 50, offset = 0 } = {}) {
    await ensureTables();
    const sql = `
        SELECT p.*,
               b.amount AS bill_amount, b.due_date AS bill_due_date,
               bp.title AS period_title, bp.period_month, bp.period_year,
               w.nama AS resident_name, w.nik AS resident_nik, w.family_id,
               f.no_kk,
               rec.username AS recorded_by_username
        FROM payments p
        JOIN bills b ON p.bill_id = b.id
        JOIN bill_periods bp ON b.bill_period_id = bp.id
        JOIN warga w ON p.resident_id = w.id
        LEFT JOIN family f ON w.family_id = f.id
        LEFT JOIN acount rec ON p.recorded_by = rec.id
        WHERE p.status = 'pending'
        ORDER BY p.created_at ASC
        LIMIT ? OFFSET ?
    `;
    try {
        const [rows] = await db.execute(sql, [String(limit), String(offset)]);
        return rows;
    } catch (err) {
        console.error("error getPendingPaymentsList:", err);
        throw err;
    }
}

/**
 * Ambil riwayat audit seluruh pembayaran (untuk RT / Superadmin / Bendahara)
 */
export async function getPaymentAuditList({ limit = 100, offset = 0, channel, status, billPeriodId } = {}) {
    await ensureTables();
    let sql = `
        SELECT p.*,
               b.amount AS bill_amount, b.due_date AS bill_due_date, b.status AS bill_status,
               bp.id AS bill_period_id, bp.title AS period_title, bp.period_month, bp.period_year,
               w.nama AS resident_name, w.nik AS resident_nik, w.family_id,
               f.no_kk,
               rec.username AS recorded_by_username,
               ver.username AS verified_by_username
        FROM payments p
        JOIN bills b ON p.bill_id = b.id
        JOIN bill_periods bp ON b.bill_period_id = bp.id
        JOIN warga w ON p.resident_id = w.id
        LEFT JOIN family f ON w.family_id = f.id
        LEFT JOIN acount rec ON p.recorded_by = rec.id
        LEFT JOIN acount ver ON p.verified_by = ver.id
        WHERE 1=1
    `;
    const params = [];

    if (status) {
        sql += " AND p.status = ?";
        params.push(status);
    }
    if (channel) {
        sql += " AND p.channel = ?";
        params.push(channel);
    }
    if (billPeriodId) {
        sql += " AND b.bill_period_id = ?";
        params.push(billPeriodId);
    }

    sql += " ORDER BY p.created_at DESC LIMIT ? OFFSET ?";
    params.push(String(limit), String(offset));

    try {
        const [rows] = await db.execute(sql, params);
        return rows;
    } catch (err) {
        console.error("error getPaymentAuditList:", err);
        throw err;
    }
}

/**
 * Update keputusan verifikasi payment (approved / rejected)
 */
export async function updatePaymentVerification(id, { status, rejectReason = null, verifiedBy = null, verifiedAt = new Date() }, connection = null) {
    await ensureTables();
    const client = connection || db;
    const sql = `
        UPDATE payments 
        SET status = ?, reject_reason = ?, verified_by = ?, verified_at = ?
        WHERE id = ?
    `;
    try {
        const [result] = await client.execute(sql, [status, rejectReason, verifiedBy, verifiedAt, id]);
        return result;
    } catch (err) {
        console.error("error updatePaymentVerification:", err);
        throw err;
    }
}
