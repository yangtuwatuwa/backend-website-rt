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
 * Buat pencatatan pembayaran baru (Single / Rapel) beserta link tagihannya
 */
export async function createPaymentWithLinks({
    familyId,
    residentId, // Fallback parameter
    totalAmount,
    channel,
    proofUrl = null,
    status = 'pending',
    rejectReason = null,
    recordedBy = null,
    verifiedBy = null,
    verifiedAt = null,
    billAllocations = [] // [{ billId, allocatedAmount }]
}, connection = null) {
    await ensureTables();
    const client = connection || db;
    const targetFamilyId = familyId || residentId;

    // 1. Insert header payments
    const sqlPayment = `
        INSERT INTO payments (
            family_id, total_amount, channel, proof_url, 
            status, reject_reason, recorded_by, verified_by, verified_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const [payResult] = await client.execute(sqlPayment, [
        targetFamilyId,
        totalAmount,
        channel,
        proofUrl,
        status,
        rejectReason,
        recordedBy,
        verifiedBy,
        verifiedAt
    ]);
    const paymentId = payResult.insertId;

    // 2. Insert links ke tabel payment_bill_links
    if (Array.isArray(billAllocations) && billAllocations.length > 0) {
        for (const alloc of billAllocations) {
            await client.execute(
                "INSERT INTO payment_bill_links (payment_id, bill_id, allocated_amount) VALUES (?, ?, ?)",
                [paymentId, alloc.billId, alloc.allocatedAmount]
            );
        }
    }

    return {
        insertId: paymentId,
        paymentId
    };
}

/**
 * Ambil payment berdasarkan ID lengkap dengan rincian bills yang terhubung
 */
export async function getPaymentById(id, connection = null) {
    await ensureTables();
    const client = connection || db;
    // TODO: alias `resident_name`/`resident_nik` bersifat sementara untuk backward-compatibility.
    // Hapus setelah frontend dipastikan sudah pindah ke `kepala_keluarga_nama`/`kepala_keluarga_nik`.
    const sql = `
        SELECT p.*,
               f.no_kk,
               w.nama AS kepala_keluarga_nama,
               w.nama AS resident_name,
               w.nik AS kepala_keluarga_nik,
               w.nik AS resident_nik,
               rec.username AS recorded_by_username,
               ver.username AS verified_by_username
        FROM payments p
        JOIN family f ON p.family_id = f.id
        LEFT JOIN warga w ON f.kepala_keluarga_id = w.id
        LEFT JOIN acount rec ON p.recorded_by = rec.id
        LEFT JOIN acount ver ON p.verified_by = ver.id
        WHERE p.id = ?
    `;
    try {
        const [rows] = await client.execute(sql, [id]);
        if (rows.length === 0) return null;
        const payment = rows[0];

        // Ambil link tagihan
        const links = await getPaymentLinksByPaymentId(id, client);
        payment.bills = links;
        return payment;
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
    const sql = "SELECT * FROM payments WHERE id = ? FOR UPDATE";
    try {
        const [rows] = await connection.execute(sql, [id]);
        return rows[0] || null;
    } catch (err) {
        console.error("error getPaymentByIdForUpdate:", err);
        throw err;
    }
}

/**
 * Ambil rincian link tagihan untuk suatu payment
 */
export async function getPaymentLinksByPaymentId(paymentId, connection = null) {
    await ensureTables();
    const client = connection || db;
    const sql = `
        SELECT pbl.id AS link_id, pbl.payment_id, pbl.bill_id, pbl.allocated_amount,
               b.amount AS bill_amount, b.due_date AS bill_due_date, b.status AS bill_status,
               b.bill_period_id,
               bp.title AS period_title, bp.period_month, bp.period_year,
               b.family_id
        FROM payment_bill_links pbl
        JOIN bills b ON pbl.bill_id = b.id
        JOIN bill_periods bp ON b.bill_period_id = bp.id
        WHERE pbl.payment_id = ?
        ORDER BY bp.period_year ASC, bp.period_month ASC, b.id ASC
    `;
    try {
        const [rows] = await client.execute(sql, [paymentId]);
        return rows;
    } catch (err) {
        console.error("error getPaymentLinksByPaymentId:", err);
        throw err;
    }
}

/**
 * Cek apakah sebuah bill_id sedang terikat di payment yang masih pending
 */
export async function isBillInPendingPayment(billId, connection = null) {
    await ensureTables();
    const client = connection || db;
    const sql = `
        SELECT p.id
        FROM payments p
        JOIN payment_bill_links pbl ON p.id = pbl.payment_id
        WHERE pbl.bill_id = ? AND p.status = 'pending'
        LIMIT 1
    `;
    try {
        const [rows] = await client.execute(sql, [billId]);
        return rows.length > 0;
    } catch (err) {
        console.error("error isBillInPendingPayment:", err);
        throw err;
    }
}

/**
 * Cek apakah sebuah tagihan sudah memiliki payment yang berstatus 'approved'
 */
export async function hasApprovedPayment(billId, connection = null) {
    await ensureTables();
    const client = connection || db;
    const sql = `
        SELECT p.id
        FROM payments p
        JOIN payment_bill_links pbl ON p.id = pbl.payment_id
        WHERE pbl.bill_id = ? AND p.status = 'approved'
        LIMIT 1
    `;
    try {
        const [rows] = await client.execute(sql, [billId]);
        return rows.length > 0;
    } catch (err) {
        console.error("error hasApprovedPayment:", err);
        throw err;
    }
}

/**
 * Ambil riwayat pembayaran untuk satu bill_id tertentu
 */
export async function getPaymentsByBillId(billId) {
    await ensureTables();
    const sql = `
        SELECT p.*, pbl.allocated_amount,
               rec.username AS recorded_by_username,
               ver.username AS verified_by_username
        FROM payments p
        JOIN payment_bill_links pbl ON p.id = pbl.payment_id
        LEFT JOIN acount rec ON p.recorded_by = rec.id
        LEFT JOIN acount ver ON p.verified_by = ver.id
        WHERE pbl.bill_id = ?
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
 * Ambil daftar pembayaran pending (menunggu verifikasi) untuk Bendahara
 */
export async function getPendingPaymentsList({ limit = 50, offset = 0 } = {}) {
    await ensureTables();
    // TODO: alias `resident_name`/`resident_nik` bersifat sementara untuk backward-compatibility.
    // Hapus setelah frontend dipastikan sudah pindah ke `kepala_keluarga_nama`/`kepala_keluarga_nik`.
    const sql = `
        SELECT p.*,
               f.no_kk,
               w.nama AS kepala_keluarga_nama,
               w.nama AS resident_name,
               w.nik AS kepala_keluarga_nik,
               w.nik AS resident_nik,
               rec.username AS recorded_by_username
        FROM payments p
        JOIN family f ON p.family_id = f.id
        LEFT JOIN warga w ON f.kepala_keluarga_id = w.id
        LEFT JOIN acount rec ON p.recorded_by = rec.id
        WHERE p.status = 'pending'
        ORDER BY p.created_at ASC
        LIMIT ? OFFSET ?
    `;
    try {
        const [payments] = await db.execute(sql, [String(limit), String(offset)]);
        
        // Populate rincian bills untuk setiap payment
        for (const pay of payments) {
            pay.bills = await getPaymentLinksByPaymentId(pay.id);
        }
        return payments;
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
    // TODO: alias `resident_name`/`resident_nik` bersifat sementara untuk backward-compatibility.
    // Hapus setelah frontend dipastikan sudah pindah ke `kepala_keluarga_nama`/`kepala_keluarga_nik`.
    let sql = `
        SELECT DISTINCT p.*,
               f.no_kk,
               w.nama AS kepala_keluarga_nama,
               w.nama AS resident_name,
               w.nik AS kepala_keluarga_nik,
               w.nik AS resident_nik,
               rec.username AS recorded_by_username,
               ver.username AS verified_by_username
        FROM payments p
        JOIN family f ON p.family_id = f.id
        LEFT JOIN warga w ON f.kepala_keluarga_id = w.id
        LEFT JOIN acount rec ON p.recorded_by = rec.id
        LEFT JOIN acount ver ON p.verified_by = ver.id
        LEFT JOIN payment_bill_links pbl ON p.id = pbl.payment_id
        LEFT JOIN bills b ON pbl.bill_id = b.id
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
        const [payments] = await db.execute(sql, params);
        for (const pay of payments) {
            pay.bills = await getPaymentLinksByPaymentId(pay.id);
        }
        return payments;
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
