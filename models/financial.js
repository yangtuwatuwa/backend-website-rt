import db from "../config/sqlconfig.js"

// === Settings ===
export async function getFinancialSettings() {
    const sqlcommand = "SELECT * FROM financial_settings WHERE id = 1"
    try {
        const [result] = await db.execute(sqlcommand)
        return result[0]
    } catch (err) {
        console.log("error getFinancialSettings:", err)
        return "error karena: " + err
    }
}

export async function updateFinancialSettings(iplNominal, previousBalance) {
    const sqlcommand = "UPDATE financial_settings SET ipl_nominal = ?, previous_balance = ? WHERE id = 1"
    try {
        const [result] = await db.execute(sqlcommand, [iplNominal, previousBalance])
        return result
    } catch (err) {
        console.log("error updateFinancialSettings:", err)
        return "error karena: " + err
    }
}

// === IPL Payments ===
export async function createIplPayment(familyId, amount, month, year, paymentProof) {
    const sqlcommand = "INSERT INTO ipl_payment (id, family_id, amount, month, year, status, payment_proof) VALUES (NULL, ?, ?, ?, ?, 'pending', ?)"
    try {
        const [result] = await db.execute(sqlcommand, [familyId, amount, month, year, paymentProof])
        return result
    } catch (err) {
        console.log("error createIplPayment:", err)
        return "error karena: " + err
    }
}

export async function getIplPaymentById(id) {
    const sqlcommand = "SELECT * FROM ipl_payment WHERE id = ?"
    try {
        const [result] = await db.execute(sqlcommand, [id])
        return result[0]
    } catch (err) {
        console.log("error getIplPaymentById:", err)
        return "error karena: " + err
    }
}

export async function getPendingIplPayments() {
    const sqlcommand = `
        SELECT ip.*, f.no_kk 
        FROM ipl_payment ip 
        LEFT JOIN family f ON ip.family_id = f.id 
        WHERE ip.status = 'pending'
    `
    try {
        const [result] = await db.execute(sqlcommand)
        return result
    } catch (err) {
        console.log("error getPendingIplPayments:", err)
        return "error karena: " + err
    }
}

export async function updateIplPaymentStatus(id, status) {
    const sqlcommand = "UPDATE ipl_payment SET status = ? WHERE id = ?"
    try {
        const [result] = await db.execute(sqlcommand, [status, id])
        return result
    } catch (err) {
        console.log("error updateIplPaymentStatus:", err)
        return "error karena: " + err
    }
}

export async function getFamilyIplHistory(familyId) {
    const sqlcommand = "SELECT * FROM ipl_payment WHERE family_id = ? ORDER BY year DESC, month DESC"
    try {
        const [result] = await db.execute(sqlcommand, [familyId])
        return result
    } catch (err) {
        console.log("error getFamilyIplHistory:", err)
        return "error karena: " + err
    }
}

// === Kas Payments ===
export async function createKasPayment(familyId, amount, category, description, paymentProof) {
    const sqlcommand = "INSERT INTO kas_payment (id, family_id, amount, category, description, status, payment_proof) VALUES (NULL, ?, ?, ?, ?, 'pending', ?)"
    try {
        const [result] = await db.execute(sqlcommand, [familyId, amount, category, description, paymentProof])
        return result
    } catch (err) {
        console.log("error createKasPayment:", err)
        return "error karena: " + err
    }
}

export async function getKasPaymentById(id) {
    const sqlcommand = "SELECT * FROM kas_payment WHERE id = ?"
    try {
        const [result] = await db.execute(sqlcommand, [id])
        return result[0]
    } catch (err) {
        console.log("error getKasPaymentById:", err)
        return "error karena: " + err
    }
}

export async function getPendingKasPayments() {
    const sqlcommand = `
        SELECT kp.*, f.no_kk 
        FROM kas_payment kp 
        LEFT JOIN family f ON kp.family_id = f.id 
        WHERE kp.status = 'pending'
    `
    try {
        const [result] = await db.execute(sqlcommand)
        return result
    } catch (err) {
        console.log("error getPendingKasPayments:", err)
        return "error karena: " + err
    }
}

export async function updateKasPaymentStatus(id, status) {
    const sqlcommand = "UPDATE kas_payment SET status = ? WHERE id = ?"
    try {
        const [result] = await db.execute(sqlcommand, [status, id])
        return result
    } catch (err) {
        console.log("error updateKasPaymentStatus:", err)
        return "error karena: " + err
    }
}

export async function getFamilyKasHistory(familyId) {
    const sqlcommand = "SELECT * FROM kas_payment WHERE family_id = ? ORDER BY payment_date DESC"
    try {
        const [result] = await db.execute(sqlcommand, [familyId])
        return result
    } catch (err) {
        console.log("error getFamilyKasHistory:", err)
        return "error karena: " + err
    }
}

// === Ledger ===
export async function insertLedger(type, amount, sourceType, description) {
    const sqlcommand = "INSERT INTO financial_ledger (id, type, amount, source_type, description) VALUES (NULL, ?, ?, ?, ?)"
    try {
        const [result] = await db.execute(sqlcommand, [type, amount, sourceType, description])
        return result
    } catch (err) {
        console.log("error insertLedger:", err)
        return "error karena: " + err
    }
}

export async function getLedgerStats() {
    const sqlIncome = "SELECT SUM(amount) AS total FROM financial_ledger WHERE type = 'in'"
    const sqlExpense = "SELECT SUM(amount) AS total FROM financial_ledger WHERE type = 'out'"
    try {
        const [incomeRes] = await db.execute(sqlIncome)
        const [expenseRes] = await db.execute(sqlExpense)
        return {
            total_income: incomeRes[0].total || 0,
            total_expense: expenseRes[0].total || 0
        }
    } catch (err) {
        console.log("error getLedgerStats:", err)
        return "error karena: " + err
    }
}

export async function getLedgerList() {
    const sqlcommand = "SELECT * FROM financial_ledger ORDER BY transaction_date DESC"
    try {
        const [result] = await db.execute(sqlcommand)
        return result
    } catch (err) {
        console.log("error getLedgerList:", err)
        return "error karena: " + err
    }
}

// === Tracking / Arrears ===
export async function getArrearsTracking(month, year) {
    const sqlcommand = `
        SELECT 
            f.id AS family_id, 
            f.no_kk, 
            w.nama AS kepala_keluarga_nama,
            (
                SELECT status 
                FROM ipl_payment 
                WHERE family_id = f.id AND month = ? AND year = ? 
                ORDER BY id DESC 
                LIMIT 1
            ) AS payment_status,
            (
                SELECT payment_date 
                FROM ipl_payment 
                WHERE family_id = f.id AND month = ? AND year = ? 
                ORDER BY id DESC 
                LIMIT 1
            ) AS payment_date
        FROM family f
        LEFT JOIN warga w ON f.kepala_keluarga_id = w.id
    `
    try {
        const [result] = await db.execute(sqlcommand, [month, year, month, year])
        return result
    } catch (err) {
        console.log("error getArrearsTracking:", err)
        return "error karena: " + err
    }
}
