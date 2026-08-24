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
 * Accessor / Helper untuk menghitung status tagihan secara dinamis.
 * Sesuai Constraint: status OVERDUE dihitung dinamis jika (due_date < NOW() AND status = 'unpaid')
 */
export function computeBillStatus(bill) {
    if (!bill) return bill;
    const now = new Date();
    const dueDate = new Date(bill.due_date);
    
    // Bandingkan tanggal jatuh tempo dengan hari ini
    const isPastDue = dueDate < now;
    const isOverdue = bill.status === 'unpaid' && isPastDue;
    
    return {
        ...bill,
        is_overdue: isOverdue,
        display_status: isOverdue ? 'overdue' : bill.status
    };
}

/**
 * Batch insert tagihan keluarga saat periode di-publish.
 * Menggunakan INSERT IGNORE / UNIQUE(bill_period_id, family_id) untuk menjamin idempotensi.
 */
export async function createBatchBills(billsData, connection = null) {
    await ensureTables();
    if (!Array.isArray(billsData) || billsData.length === 0) return { affectedRows: 0 };
    const client = connection || db;

    const values = [];
    const placeholders = billsData.map(b => {
        values.push(b.bill_period_id, b.family_id, b.amount, b.due_date, b.status || 'unpaid');
        return "(?, ?, ?, ?, ?)";
    }).join(", ");

    const sql = `
        INSERT IGNORE INTO bills (bill_period_id, family_id, amount, due_date, status)
        VALUES ${placeholders}
    `;

    try {
        const [result] = await client.execute(sql, values);
        return result;
    } catch (err) {
        console.error("error createBatchBills:", err);
        throw err;
    }
}

/**
 * Ambil detail tagihan berdasarkan ID
 */
export async function getBillById(id, connection = null) {
    await ensureTables();
    const client = connection || db;
    const sql = `
        SELECT b.*,
               bp.title AS period_title, bp.period_month, bp.period_year,
               f.no_kk,
               kk.nama AS resident_name, kk.nik AS resident_nik,
               h.blok AS house_blok, h.nomor AS house_nomor,
               a.username AS exempt_by_username
        FROM bills b
        JOIN bill_periods bp ON b.bill_period_id = bp.id
        JOIN family f ON b.family_id = f.id
        LEFT JOIN warga kk ON f.kepala_keluarga_id = kk.id
        LEFT JOIN house h ON f.house_id = h.id
        LEFT JOIN acount a ON b.exempt_by = a.id
        WHERE b.id = ?
    `;
    try {
        const [rows] = await client.execute(sql, [id]);
        if (rows.length === 0) return null;
        return computeBillStatus(rows[0]);
    } catch (err) {
        console.error("error getBillById:", err);
        throw err;
    }
}

/**
 * Ambil detail tagihan dengan Pessimistic Lock (FOR UPDATE) dalam transaksi
 */
export async function getBillByIdForUpdate(id, connection) {
    await ensureTables();
    const sql = "SELECT * FROM bills WHERE id = ? FOR UPDATE";
    try {
        const [rows] = await connection.execute(sql, [id]);
        return rows[0] || null;
    } catch (err) {
        console.error("error getBillByIdForUpdate:", err);
        throw err;
    }
}

/**
 * Ambil daftar tagihan untuk satu keluarga (family_id)
 */
export async function getBillsByFamilyId(familyId, { status, year, month } = {}) {
    await ensureTables();
    let sql = `
        SELECT b.*,
               bp.title AS period_title, bp.period_month, bp.period_year,
               f.no_kk,
               kk.nama AS resident_name,
               p.id AS latest_payment_id,
               p.status AS latest_payment_status,
               p.reject_reason AS latest_reject_reason,
               p.channel AS latest_payment_channel,
               p.proof_url AS latest_proof_url,
               p.created_at AS latest_payment_date
        FROM bills b
        JOIN bill_periods bp ON b.bill_period_id = bp.id
        JOIN family f ON b.family_id = f.id
        LEFT JOIN warga kk ON f.kepala_keluarga_id = kk.id
        LEFT JOIN (
            SELECT pbl.bill_id, p1.id, p1.status, p1.channel, p1.proof_url, p1.reject_reason, p1.created_at
            FROM payment_bill_links pbl
            JOIN payments p1 ON pbl.payment_id = p1.id
            INNER JOIN (
                SELECT pbl2.bill_id, MAX(p2.id) AS max_id
                FROM payment_bill_links pbl2
                JOIN payments p2 ON pbl2.payment_id = p2.id
                GROUP BY pbl2.bill_id
            ) latest ON pbl.bill_id = latest.bill_id AND p1.id = latest.max_id
        ) p ON b.id = p.bill_id
        WHERE b.family_id = ?
    `;
    const params = [familyId];

    if (status) {
        if (status === 'overdue') {
            sql += " AND b.status = 'unpaid' AND b.due_date < CURDATE()";
        } else {
            sql += " AND b.status = ?";
            params.push(status);
        }
    }
    if (year) {
        sql += " AND bp.period_year = ?";
        params.push(year);
    }
    if (month) {
        sql += " AND bp.period_month = ?";
        params.push(month);
    }

    sql += " ORDER BY bp.period_year DESC, bp.period_month DESC, b.id DESC";

    try {
        const [rows] = await db.execute(sql, params);
        return rows.map(computeBillStatus);
    } catch (err) {
        console.error("error getBillsByFamilyId:", err);
        throw err;
    }
}

/**
 * Ambil daftar tagihan dengan Pessimistic Lock (FOR UPDATE) untuk banyak ID dalam transaksi
 */
export async function getBillsByIdsForUpdate(ids, connection) {
    await ensureTables();
    if (!Array.isArray(ids) || ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(", ");
    const sql = `
        SELECT b.*, f.no_kk, bp.title AS period_title, bp.period_month, bp.period_year
        FROM bills b
        JOIN family f ON b.family_id = f.id
        JOIN bill_periods bp ON b.bill_period_id = bp.id
        WHERE b.id IN (${placeholders})
        FOR UPDATE
    `;
    try {
        const [rows] = await connection.execute(sql, ids);
        return rows;
    } catch (err) {
        console.error("error getBillsByIdsForUpdate:", err);
        throw err;
    }
}

/**
 * Ambil daftar tagihan dalam suatu periode tertentu (untuk dashboard Bendahara/RT)
 */
export async function getBillsByPeriodId(billPeriodId, { status, limit = 100, offset = 0 } = {}) {
    await ensureTables();
    let sql = `
        SELECT b.*,
               f.no_kk,
               kk.nama AS resident_name, kk.nik AS resident_nik,
               h.blok AS house_blok, h.nomor AS house_nomor,
               p.id AS latest_payment_id, p.status AS payment_status, p.channel AS payment_channel, p.proof_url
        FROM bills b
        JOIN family f ON b.family_id = f.id
        LEFT JOIN warga kk ON f.kepala_keluarga_id = kk.id
        LEFT JOIN house h ON f.house_id = h.id
        LEFT JOIN (
            SELECT pbl.bill_id, p1.id, p1.status, p1.channel, p1.proof_url
            FROM payment_bill_links pbl
            JOIN payments p1 ON pbl.payment_id = p1.id
            INNER JOIN (
                SELECT pbl2.bill_id, MAX(p2.id) AS max_id
                FROM payment_bill_links pbl2
                JOIN payments p2 ON pbl2.payment_id = p2.id
                GROUP BY pbl2.bill_id
            ) latest ON pbl.bill_id = latest.bill_id AND p1.id = latest.max_id
        ) p ON b.id = p.bill_id
        WHERE b.bill_period_id = ?
    `;
    const params = [billPeriodId];

    if (status) {
        if (status === 'overdue') {
            sql += " AND b.status = 'unpaid' AND b.due_date < CURDATE()";
        } else {
            sql += " AND b.status = ?";
            params.push(status);
        }
    }

    sql += " ORDER BY b.id ASC LIMIT ? OFFSET ?";
    params.push(String(limit), String(offset));

    try {
        const [rows] = await db.execute(sql, params);
        return rows.map(computeBillStatus);
    } catch (err) {
        console.error("error getBillsByPeriodId:", err);
        throw err;
    }
}

/**
 * Update status tagihan (misal: 'unpaid' -> 'waiting_verification' -> 'paid')
 */
export async function updateBillStatus(id, status, connection = null) {
    await ensureTables();
    const client = connection || db;
    const sql = "UPDATE bills SET status = ? WHERE id = ?";
    try {
        const [result] = await client.execute(sql, [status, id]);
        return result;
    } catch (err) {
        console.error("error updateBillStatus:", err);
        throw err;
    }
}

/**
 * Batch update status tagihan untuk banyak ID
 */
export async function updateMultipleBillStatus(ids, status, connection = null) {
    await ensureTables();
    if (!Array.isArray(ids) || ids.length === 0) return { affectedRows: 0 };
    const client = connection || db;
    const placeholders = ids.map(() => "?").join(", ");
    const sql = `UPDATE bills SET status = ? WHERE id IN (${placeholders})`;
    try {
        const [result] = await client.execute(sql, [status, ...ids]);
        return result;
    } catch (err) {
        console.error("error updateMultipleBillStatus:", err);
        throw err;
    }
}

/**
 * Set status tagihan menjadi 'exempt' (dibebaskan)
 */
export async function setBillExempt(id, reason, actorId, connection = null) {
    await ensureTables();
    const client = connection || db;
    const sql = `
        UPDATE bills 
        SET status = 'exempt', exempt_reason = ?, exempt_by = ?, exempt_at = NOW() 
        WHERE id = ?
    `;
    try {
        const [result] = await client.execute(sql, [reason || "Dibebaskan oleh pengurus", actorId || null, id]);
        return result;
    } catch (err) {
        console.error("error setBillExempt:", err);
        throw err;
    }
}

/**
 * Ambil ringkasan rekapitulasi tagihan per periode
 */
export async function getBillsSummaryByPeriodId(billPeriodId) {
    await ensureTables();
    const sql = `
        SELECT 
            COUNT(id) AS total_bills,
            SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS count_paid,
            SUM(CASE WHEN status = 'waiting_verification' THEN 1 ELSE 0 END) AS count_waiting_verification,
            SUM(CASE WHEN status = 'unpaid' AND due_date >= CURDATE() THEN 1 ELSE 0 END) AS count_unpaid,
            SUM(CASE WHEN status = 'unpaid' AND due_date < CURDATE() THEN 1 ELSE 0 END) AS count_overdue,
            SUM(CASE WHEN status = 'exempt' THEN 1 ELSE 0 END) AS count_exempt,
            COALESCE(SUM(amount), 0) AS total_billed,
            COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) AS total_collected,
            COALESCE(SUM(CASE WHEN status = 'unpaid' OR status = 'waiting_verification' THEN amount ELSE 0 END), 0) AS total_uncollected
        FROM bills
        WHERE bill_period_id = ?
    `;
    try {
        const [rows] = await db.execute(sql, [billPeriodId]);
        const summary = rows[0] || {};
        return {
            total_bills: Number(summary.total_bills || 0),
            count_paid: Number(summary.count_paid || 0),
            count_waiting_verification: Number(summary.count_waiting_verification || 0),
            count_unpaid: Number(summary.count_unpaid || 0),
            count_overdue: Number(summary.count_overdue || 0),
            count_exempt: Number(summary.count_exempt || 0),
            total_billed: Number(summary.total_billed || 0),
            total_collected: Number(summary.total_collected || 0),
            total_uncollected: Number(summary.total_uncollected || 0)
        };
    } catch (err) {
        console.error("error getBillsSummaryByPeriodId:", err);
        throw err;
    }
}
