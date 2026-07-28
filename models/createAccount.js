import db from "../config/sqlconfig.js";

export async function checkFamilyAccountExists(familyId) {
    const sqlcommand = "SELECT id FROM acount WHERE family_id = ?";
    try {
        const [result] = await db.execute(sqlcommand, [familyId]);
        return result.length > 0;
    } catch (err) {
        console.log("error checkFamilyAccountExists:", err);
        throw err;
    }
}

export async function createFamilyAccount(username, passwordHash, familyId) {
    const sqlcommand = "INSERT INTO acount (id, username, password, email, role, family_id, must_change_password) VALUES (NULL, ?, ?, NULL, 'warga', ?, 1)";
    try {
        const [result] = await db.execute(sqlcommand, [username, passwordHash, familyId]);
        return result;
    } catch (err) {
        console.log("error createFamilyAccount:", err);
        throw err;
    }
}

export async function createStaffAccount(username, passwordHash, email, role) {
    const sqlcommand = "INSERT INTO acount (id, username, password, email, role, family_id, must_change_password) VALUES (NULL, ?, ?, ?, ?, NULL, 1)";
    try {
        const [result] = await db.execute(sqlcommand, [username, passwordHash, email, role]);
        return result;
    } catch (err) {
        console.log("error createStaffAccount:", err);
        throw err;
    }
}

export async function bindAccountToFamily(userId, familyId) {
    const sqlcommand = "UPDATE acount SET family_id = ? WHERE id = ?";
    try {
        const [result] = await db.execute(sqlcommand, [familyId, userId]);
        return result;
    } catch (err) {
        console.log("error bindAccountToFamily:", err);
        return "error karena: " + err;
    }
}
