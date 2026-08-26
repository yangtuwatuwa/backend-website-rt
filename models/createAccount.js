import db from "../config/sqlconfig.js";

export async function checkUsernameExists(username, conn = db) {
    const sqlcommand = "SELECT id FROM acount WHERE username = ?";
    try {
        const [result] = await conn.execute(sqlcommand, [username]);
        return result.length > 0;
    } catch (err) {
        console.log("error checkUsernameExists:", err);
        throw err;
    }
}

export async function checkFamilyAccountExists(familyId, conn = db) {
    const sqlcommand = "SELECT id FROM acount WHERE family_id = ?";
    try {
        const [result] = await conn.execute(sqlcommand, [familyId]);
        return result.length > 0;
    } catch (err) {
        console.log("error checkFamilyAccountExists:", err);
        throw err;
    }
}

export async function getAccountByFamilyId(familyId, conn = db) {
    const sqlcommand = "SELECT id, username, role, is_verified FROM acount WHERE family_id = ?";
    try {
        const [result] = await conn.execute(sqlcommand, [familyId]);
        if (result.length > 0) {
            return {
                exists: true,
                hasAccount: true,
                has_account: true,
                status: "registered",
                accountId: result[0].id,
                account_id: result[0].id,
                username: result[0].username,
                role: result[0].role,
                is_verified: result[0].is_verified
            };
        }
        return {
            exists: false,
            hasAccount: false,
            has_account: false,
            status: "unregistered",
            accountId: null,
            account_id: null,
            username: null,
            role: null,
            is_verified: 0
        };
    } catch (err) {
        console.log("error getAccountByFamilyId:", err);
        throw err;
    }
}

export async function createFamilyAccount(username, passwordHash, familyId, emailEncrypted, emailBlindIdx, conn = db) {
    const sqlcommand = "INSERT INTO acount (id, username, password, email_encrypted, email_blind_idx, role, family_id, must_change_password, is_verified) VALUES (NULL, ?, ?, ?, ?, 'warga', ?, 1, 0)";
    try {
        const [result] = await conn.execute(sqlcommand, [username, passwordHash, emailEncrypted, emailBlindIdx, familyId]);
        return result;
    } catch (err) {
        if (err && (err.code === 'ER_DUP_ENTRY' || err.errno === 1062)) {
            throw new Error("email atau username sudah terdaftar");
        }
        console.log("error createFamilyAccount:", err);
        throw err;
    }
}

export async function createStaffAccount(username, passwordHash, emailEncrypted, emailBlindIdx, role, conn = db) {
    const sqlcommand = "INSERT INTO acount (id, username, password, email_encrypted, email_blind_idx, role, family_id, must_change_password, is_verified) VALUES (NULL, ?, ?, ?, ?, ?, NULL, 1, 1)";
    try {
        const [result] = await conn.execute(sqlcommand, [username, passwordHash, emailEncrypted, emailBlindIdx, role]);
        return result;

    } catch (err) {
        if (err && (err.code === 'ER_DUP_ENTRY' || err.errno === 1062)) {
            throw new Error("email atau username sudah terdaftar");
        }
        console.log("error createStaffAccount:", err);
        throw err;
    }
}

export async function bindAccountToFamily(userId, familyId, conn = db) {
    const sqlcommand = "UPDATE acount SET family_id = ? WHERE id = ?";
    try {
        const [result] = await conn.execute(sqlcommand, [familyId, userId]);
        return result;
    } catch (err) {
        console.log("error bindAccountToFamily:", err);
        return "error karena: " + err;
    }
}
