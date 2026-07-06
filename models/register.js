import { tryCatch } from "bullmq"
import pool from "../config/sqlconfig.js"

async function registerAccount(username , password , email , role) {
    const sqlcommand = 'INSERT INTO acount (id , username , password , email , role ) VALUES ( NULL , ? , ? , ? , ? ) '
    try {
        const result = await pool.execute( sqlcommand , [username, password , email , role])
        return result;
    } catch (err) {
        console.log("error bagian:" + err)
        return res.json("error")
    }

}

export default registerAccount;