import pool from "../config/sqlconfig.js";

export async function checkUsernameExistsExceptUser(username, userId, executor = pool) {
    const sql = "SELECT id FROM acount WHERE username = ? AND id != ?";
    try {
        const [rows] = await executor.execute(sql, [username, userId]);
        return rows.length > 0;
    } catch (err) {
        console.log("error checkUsernameExistsExceptUser:", err);
        throw err;
    }
}

export async function updateAccountProfile(userId, { username, encryptedEmail, blindIdx, passwordHash }, executor = pool) {
    let fields = [];
    let values = [];

    if (username !== undefined) {
        fields.push("username = ?");
        values.push(username);
    }
    if (encryptedEmail !== undefined && blindIdx !== undefined) {
        fields.push("email_encrypted = ?");
        values.push(encryptedEmail);
        fields.push("email_blind_idx = ?");
        values.push(blindIdx);
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
        const [result] = await executor.execute(sql, values);
        return result;
    } catch (err) {
        if (err && (err.code === 'ER_DUP_ENTRY' || err.errno === 1062)) {
            throw new Error("Email atau username sudah digunakan oleh pengguna lain");
        }
        console.log("error updateAccountProfile:", err);
        throw err;
    }
}

