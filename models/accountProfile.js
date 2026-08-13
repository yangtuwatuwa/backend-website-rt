import pool from "../config/sqlconfig.js";

export async function checkUsernameExistsExceptUser(username, userId) {
    const sql = "SELECT id FROM acount WHERE username = ? AND id != ?";
    try {
        const [rows] = await pool.execute(sql, [username, userId]);
        return rows.length > 0;
    } catch (err) {
        console.log("error checkUsernameExistsExceptUser:", err);
        throw err;
    }
}

export async function updateAccountProfile(userId, { username, encryptedEmail, passwordHash }) {
    let fields = [];
    let values = [];

    if (username !== undefined) {
        fields.push("username = ?");
        values.push(username);
    }
    if (encryptedEmail !== undefined) {
        fields.push("email = ?");
        values.push(encryptedEmail);
    }
    if (passwordHash !== undefined) {
        fields.push("password = ?");
        values.push(passwordHash);
        fields.push("must_change_password = 0");
    }

    if (fields.length === 0) {
        return false;
    }

    values.push(userId);
    const sql = `UPDATE acount SET ${fields.join(", ")} WHERE id = ?`;

    try {
        const [result] = await pool.execute(sql, values);
        return result;
    } catch (err) {
        console.log("error updateAccountProfile:", err);
        throw err;
    }
}
