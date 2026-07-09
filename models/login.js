import pool from "../config/sqlconfig.js"

async function loginAccount(username) {
    const sqlcommand = 'SELECT * FROM acount WHERE username = ? '
    try {
        const [result] = await pool.execute( sqlcommand , [username])
        return result;
    } catch (err) {
        console.log("error bagian:" + err)
        return "error"
    }

}

export async function getAccountById(id) {
    const sqlcommand = 'SELECT * FROM acount WHERE id = ? '
    try {
        const [result] = await pool.execute( sqlcommand , [id])
        return result;
    } catch (err) {
        console.log("error bagian:" + err)
        return "error"
    }
}

export default loginAccount;
