import pool from "../config/sqlconfig.js"

/**
 * Cek apakah email (via blind index) sudah terdaftar di tabel acount.
 * @param {string} emailBlindIdx 
 * @returns {Promise<boolean>}
 */
export async function findAccountByBlindIndex(emailBlindIdx) {
    const sql = "SELECT id FROM acount WHERE email_blind_idx = ?"
    try {
        const [rows] = await pool.execute(sql, [emailBlindIdx])
        return rows.length > 0
    } catch (err) {
        console.log("error findAccountByBlindIndex:", err)
        throw err
    }
}

async function registerAccount(username, password, emailEncrypted, emailBlindIdx, role, familyId = null) {
    const sqlcommand = 'INSERT INTO acount (id, username, password, email_encrypted, email_blind_idx, role, family_id) VALUES (NULL, ?, ?, ?, ?, ?, ?)'
    try {
        const result = await pool.execute(sqlcommand, [username, password, emailEncrypted, emailBlindIdx, role, familyId])
        return result;
    } catch (err) {
        if (err && (err.code === 'ER_DUP_ENTRY' || err.errno === 1062)) {
            console.log("Duplicate entry detected in registerAccount:", err.message)
            return "error: email sudah terdaftar"
        }
        console.log("error bagian:" + err)
        return "error karena: "+ err
    }

}

export default registerAccount;