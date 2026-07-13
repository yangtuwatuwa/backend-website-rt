import db from "../config/sqlconfig.js";

export async function updateWargaPassword(userId, passwordHash) {
    const sqlcommand = "UPDATE acount SET password = ?, must_change_password = 0 WHERE id = ?";
    try {
        const [result] = await db.execute(sqlcommand, [passwordHash, userId]);
        return result;
    } catch (err) {
        console.log("error updateWargaPassword:", err);
        throw err;
    }
}
