import pool from "../config/sqlconfig.js"

async function findAccount(username) {
    const sqlcommand = 'SELECT * FROM acount WHERE username = ?'
    try {
        const [rows] = await pool.execute( sqlcommand , [username])
        return rows[0];
    } catch (err) {
        console.log("error bagian:" + err)
        return { error: true, message: err.message };
    }

}

export default findAccount;
