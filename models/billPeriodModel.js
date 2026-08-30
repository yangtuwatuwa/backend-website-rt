import db from "../config/sqlconfig.js";
import { initIplBillingTables } from "../utils/migrateIplBills.js";

let tablesInitialized = false;
async function ensureTables(executor) {
    if (executor !== db) {
        return;
    }

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
 * Buat periode tagihan baru (Draft)
 */
export async function createBillPeriod(data, executor = db) {
    const client = executor || db;
    const { title, defaultAmount, dueDate, periodMonth, periodYear, createdBy } = data;
    await ensureTables(client);
    const sql = `
        INSERT INTO bill_periods (id, title, default_amount, due_date, period_month, period_year, status, created_by)
        VALUES (NULL, ?, ?, ?, ?, ?, 'draft', ?)
    `;
    try {
        const [result] = await client.execute(sql, [
            title,
            defaultAmount,
            dueDate,
            periodMonth,
            periodYear,
            createdBy || null
        ]);
        return result;
    } catch (err) {
        console.error("error createBillPeriod:", err);
        throw err;
    }
}

/**
 * Ambil periode tagihan berdasarkan ID
 */
export async function getBillPeriodById(id, executor = db) {
    const client = executor || db;
    await ensureTables(client);
    const sql = `
        SELECT bp.*, a.username AS creator_username
        FROM bill_periods bp
        LEFT JOIN acount a ON bp.created_by = a.id
        WHERE bp.id = ?
    `;
    try {
        const [rows] = await client.execute(sql, [id]);
        return rows[0] || null;
    } catch (err) {
        console.error("error getBillPeriodById:", err);
        throw err;
    }
}

/**
 * Ambil periode tagihan berdasarkan bulan dan tahun
 */
export async function getBillPeriodByMonthYear(month, year, executor = db) {
    const client = executor || db;
    await ensureTables(client);
    const sql = "SELECT * FROM bill_periods WHERE period_month = ? AND period_year = ? LIMIT 1";
    try {
        const [rows] = await client.execute(sql, [month, year]);
        return rows[0] || null;
    } catch (err) {
        console.error("error getBillPeriodByMonthYear:", err);
        throw err;
    }
}

/**
 * Ambil daftar semua periode tagihan dengan filter opsional
 */
export async function getAllBillPeriods(
    { status, periodYear, periodMonth, limit = 50, offset = 0 } = {},
    executor = db
) {
    const client = executor || db;
    await ensureTables(client);
    let sql = `
        SELECT bp.*, a.username AS creator_username,
               (SELECT COUNT(b.id) FROM bills b WHERE b.bill_period_id = bp.id) AS total_bills,
               (SELECT COUNT(b.id) FROM bills b WHERE b.bill_period_id = bp.id AND b.status = 'paid') AS paid_bills
        FROM bill_periods bp
        LEFT JOIN acount a ON bp.created_by = a.id
        WHERE 1=1
    `;
    const params = [];

    if (status) {
        sql += " AND bp.status = ?";
        params.push(status);
    }
    if (periodYear) {
        sql += " AND bp.period_year = ?";
        params.push(periodYear);
    }
    if (periodMonth) {
        sql += " AND bp.period_month = ?";
        params.push(periodMonth);
    }

    sql += " ORDER BY bp.period_year DESC, bp.period_month DESC, bp.id DESC LIMIT ? OFFSET ?";
    params.push(String(limit), String(offset));

    try {
        const [rows] = await client.execute(sql, params);
        return rows;
    } catch (err) {
        console.error("error getAllBillPeriods:", err);
        throw err;
    }
}

/**
 * Update status periode (misal: 'draft' -> 'published')
 */
export async function updateBillPeriodStatus(id, status, executor = db) {
    const client = executor || db;
    await ensureTables(client);
    const sql = "UPDATE bill_periods SET status = ? WHERE id = ?";
    try {
        const [result] = await client.execute(sql, [status, id]);
        return result;
    } catch (err) {
        console.error("error updateBillPeriodStatus:", err);
        throw err;
    }
}

/**
 * Hapus periode tagihan (hanya jika masih draft dan belum punya tagihan)
 */
export async function deleteBillPeriod(id, executor = db) {
    const client = executor || db;
    await ensureTables(client);
    const sql = "DELETE FROM bill_periods WHERE id = ? AND status = 'draft'";
    try {
        const [result] = await client.execute(sql, [id]);
        return result;
    } catch (err) {
        console.error("error deleteBillPeriod:", err);
        throw err;
    }
}
