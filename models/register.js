import { tryCatch } from "bullmq"
import pool from "../config/sqlconfig.js"

async function registerAccount(username, password, email, role, familyId = null) {
    const sqlcommand = 'INSERT INTO acount (id, username, password, email, role, family_id) VALUES (NULL, ?, ?, ?, ?, ?)'
    try {
        const result = await pool.execute(sqlcommand, [username, password, email, role, familyId])
        return result;
    } catch (err) {
        console.log("error bagian:" + err)
        return "error karena: "+ err
    }

}

export default registerAccount;