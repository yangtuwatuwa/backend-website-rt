import pool from "../config/sqlconfig.js"
import { AUTH_COLUMNS_SQL, SAFE_COLUMNS_SQL } from "../helpers/sanitizeUser.js"

/**
 * Login query — SATU-SATUNYA tempat yang boleh SELECT password.
 * Hanya boleh dipanggil dari auth service (bisnisRegisterAndLogin.js).
 */
async function loginAccount(username) {
    const sqlcommand = `SELECT ${AUTH_COLUMNS_SQL} FROM acount WHERE username = ?`
    try {
        const [result] = await pool.execute(sqlcommand, [username])
        return result;
    } catch (err) {
        console.log("error bagian:" + err)
        return "error"
    }
}

/**
 * Get account by ID — TANPA password.
 * Aman untuk dipanggil dari controller/service manapun.
 */
export async function getAccountById(id) {
    const sqlcommand = `SELECT ${SAFE_COLUMNS_SQL} FROM acount WHERE id = ?`
    try {
        const [result] = await pool.execute(sqlcommand, [id])
        return result;
    } catch (err) {
        console.log("error bagian:" + err)
        return "error"
    }
}

/**
 * Get account by ID — DENGAN password (untuk verifikasi password lama).
 * Hanya boleh dipanggil dari accountProfileService.js (update password).
 */
export async function getAccountByIdWithAuth(id) {
    const sqlcommand = `SELECT ${AUTH_COLUMNS_SQL} FROM acount WHERE id = ?`
    try {
        const [result] = await pool.execute(sqlcommand, [id])
        return result;
    } catch (err) {
        console.log("error bagian:" + err)
        return "error"
    }
}

export default loginAccount;
