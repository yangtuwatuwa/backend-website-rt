import db from "../config/sqlconfig.js";

// =========================================================================
// ⚙️ PENGATURAN KEUANGAN (SETTINGS)
// CATATAN: ipl_nominal di sini HANYA sebagai nilai default / template form
// saat Bendahara membuat draft bill_period baru (defaultAmount).
// Nilai ini TIDAK PERNAH dipakai untuk menghitung tagihan aktif warga secara langsung.
// Begitu bill_period dibuat & dipublish, nominal di-snapshot ke tabel 'bills'.
// =========================================================================

export async function getFinancialSettings() {
    const sqlcommand = "SELECT * FROM financial_settings WHERE id = 1";
    try {
        const [result] = await db.execute(sqlcommand);
        return result[0];
    } catch (err) {
        console.error("error getFinancialSettings:", err);
        throw err;
    }
}

export async function updateFinancialSettings(iplNominal, previousBalance) {
    const sqlcommand = "UPDATE financial_settings SET ipl_nominal = ?, previous_balance = ? WHERE id = 1";
    try {
        const [result] = await db.execute(sqlcommand, [iplNominal, previousBalance]);
        return result;
    } catch (err) {
        console.error("error updateFinancialSettings:", err);
        throw err;
    }
}

// =========================================================================
// 📖 BUKU KAS BESAR (FINANCIAL LEDGER)
// =========================================================================

/**
 * Helper terpadu untuk mencatat transaksi masuk/keluar ke Buku Kas RT (financial_ledger).
 * Dipakai bersama oleh: Approval IPL, Approval Kas, Manual Payment, Expense, dan Income.
 */
export async function writeLedgerEntry({ type = 'in', amount, sourceType, description, receiptFile = null, connection = null }) {
    const client = connection || db;
    const cleanAmount = Number(amount);
    const cleanSourceType = String(sourceType || "lainnya").toLowerCase().trim();
    const cleanDesc = description || "-";

    try {
        const sql = "INSERT INTO financial_ledger (id, type, amount, source_type, description, receipt_file) VALUES (NULL, ?, ?, ?, ?, ?)";
        const [result] = await client.execute(sql, [type, cleanAmount, cleanSourceType, cleanDesc, receiptFile]);
        return result;
    } catch (err) {
        // Fallback jika kolom receipt_file belum ada
        try {
            await client.execute("ALTER TABLE financial_ledger ADD COLUMN IF NOT EXISTS receipt_file VARCHAR(255)");
            const [result] = await client.execute(
                "INSERT INTO financial_ledger (id, type, amount, source_type, description, receipt_file) VALUES (NULL, ?, ?, ?, ?, ?)",
                [type, cleanAmount, cleanSourceType, cleanDesc, receiptFile]
            );
            return result;
        } catch (alterErr) {
            const fallbackDesc = receiptFile ? `[Receipt: ${receiptFile}] ${cleanDesc}` : cleanDesc;
            const [result] = await client.execute(
                "INSERT INTO financial_ledger (id, type, amount, source_type, description) VALUES (NULL, ?, ?, ?, ?)",
                [type, cleanAmount, cleanSourceType, fallbackDesc]
            );
            return result;
        }
    }
}

export async function insertLedger(type, amount, sourceType, description, receiptFile = null, connection = null) {
    return writeLedgerEntry({ type, amount, sourceType, description, receiptFile, connection });
}

export async function getMonthlyFinancialSummary(year = new Date().getFullYear()) {
    const sqlcommand = `
        SELECT 
            MONTH(transaction_date) AS month,
            YEAR(transaction_date) AS year,
            SUM(CASE WHEN type = 'in' THEN amount ELSE 0 END) AS total_income,
            SUM(CASE WHEN type = 'out' THEN amount ELSE 0 END) AS total_expense
        FROM financial_ledger
        WHERE YEAR(transaction_date) = ?
        GROUP BY YEAR(transaction_date), MONTH(transaction_date)
        ORDER BY month ASC
    `;
    try {
        const [result] = await db.execute(sqlcommand, [year]);
        return result;
    } catch (err) {
        console.error("error getMonthlyFinancialSummary:", err);
        throw err;
    }
}

export async function getLedgerStats() {
    const sqlIncome = "SELECT SUM(amount) AS total FROM financial_ledger WHERE type = 'in'";
    const sqlExpense = "SELECT SUM(amount) AS total FROM financial_ledger WHERE type = 'out'";
    try {
        const [incomeRes] = await db.execute(sqlIncome);
        const [expenseRes] = await db.execute(sqlExpense);
        return {
            total_income: incomeRes[0].total || 0,
            total_expense: expenseRes[0].total || 0
        };
    } catch (err) {
        console.error("error getLedgerStats:", err);
        throw err;
    }
}

export async function getLedgerList() {
    const sqlcommand = "SELECT * FROM financial_ledger ORDER BY transaction_date DESC, id DESC";
    try {
        const [result] = await db.execute(sqlcommand);
        return result;
    } catch (err) {
        console.error("error getLedgerList:", err);
        throw err;
    }
}

// =========================================================================
// 📊 PELACAKAN TUNGGAKAN WARGA (ARREARS TRACKING)
// Mengambil data tagihan aktif langsung dari tabel 'bills' join 'bill_periods'
// =========================================================================

export async function getArrearsTracking(month, year) {
    const targetMonth = Number(month);
    const targetYear = Number(year);

    const sqlcommand = `
        SELECT 
            f.id AS family_id, 
            f.no_kk, 
            COALESCE(w.nama, (SELECT w2.nama FROM warga w2 WHERE w2.family_id = f.id ORDER BY w2.id ASC LIMIT 1), 'Tanpa Nama') AS kepala_keluarga_nama,
            b.id AS bill_id,
            b.amount AS bill_amount,
            b.due_date,
            b.status AS bill_status,
            bp.id AS bill_period_id,
            bp.title AS period_title,
            p.id AS payment_id,
            p.status AS payment_status,
            p.created_at AS payment_date,
            p.channel AS payment_channel
        FROM family f
        LEFT JOIN warga w ON f.kepala_keluarga_id = w.id
        LEFT JOIN bill_periods bp ON bp.period_month = ? AND bp.period_year = ?
        LEFT JOIN bills b ON b.bill_period_id = bp.id AND (
            b.resident_id = f.kepala_keluarga_id 
            OR b.resident_id = (SELECT w3.id FROM warga w3 WHERE w3.family_id = f.id ORDER BY w3.id ASC LIMIT 1)
        )
        LEFT JOIN (
            SELECT pbl.bill_id, p1.id, p1.status, p1.channel, p1.created_at
            FROM payment_bill_links pbl
            JOIN payments p1 ON pbl.payment_id = p1.id
            INNER JOIN (
                SELECT pbl2.bill_id, MAX(p2.id) AS max_id
                FROM payment_bill_links pbl2
                JOIN payments p2 ON pbl2.payment_id = p2.id
                GROUP BY pbl2.bill_id
            ) latest ON pbl.bill_id = latest.bill_id AND p1.id = latest.max_id
        ) p ON b.id = p.bill_id
        ORDER BY f.id ASC
    `;
    try {
        const [result] = await db.execute(sqlcommand, [targetMonth, targetYear]);
        return result;
    } catch (err) {
        console.error("error getArrearsTracking:", err);
        throw err;
    }
}
