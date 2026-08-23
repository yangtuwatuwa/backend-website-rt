import { getAccountById, getAccountByIdWithAuth } from "../models/login.js";
import { checkUsernameExistsExceptUser, updateAccountProfile } from "../models/accountProfile.js";
import { normalizeEmail, computeBlindIndex, encryptEmail, decryptEmail } from "../lib/crypto/email.js";
import { argonhash, argonverify } from "../helpers/argon2.js";
import { SAFE_COLUMNS_SQL } from "../helpers/sanitizeUser.js";
import pool from "../config/sqlconfig.js";

export async function getMyAccountService(userId) {
    try {
        const rows = await getAccountById(userId);
        if (!rows || rows === "error" || rows.length === 0) {
            return "error: Akun tidak ditemukan";
        }

        const user = rows[0];
        let decryptedEmail = null;
        if (user.email_encrypted) {
            try {
                decryptedEmail = decryptEmail(user.email_encrypted);
            } catch (e) {
                decryptedEmail = null;
            }
        }

        return {
            id: user.id,
            username: user.username,
            email: decryptedEmail,
            role: user.role,
            familyId: user.family_id,
            family_id: user.family_id,
            mustChangePassword: user.must_change_password
        };
    } catch (err) {
        console.log("error getMyAccountService:", err);
        return "error karena: " + err;
    }
}

export async function updateMyAccountService(userId, { username, email, oldPassword, newPassword, password }) {
    const targetNewPassword = newPassword || password;
    try {
        // Ambil data user DENGAN password (butuh untuk verifikasi password lama)
        const rows = await getAccountByIdWithAuth(userId);
        if (!rows || rows === "error" || rows.length === 0) {
            return "error: Akun tidak ditemukan";
        }
        const currentUser = rows[0];

        // 1. Jika mau ganti password, WAJIB verifikasi oldPassword
        let passwordHash = undefined;
        if (targetNewPassword && targetNewPassword.trim() !== "") {
            if (!oldPassword) {
                return "error: Password lama wajib diisi untuk mengubah password";
            }
            const isMatch = await argonverify(currentUser.password, oldPassword);
            if (!isMatch) {
                return "error: Password lama yang anda masukkan salah";
            }
            passwordHash = await argonhash(targetNewPassword.trim());
        }

        // 2. Jika ganti username, cek keunikan
        if (username && username.trim() !== currentUser.username) {
            const isTaken = await checkUsernameExistsExceptUser(username.trim(), userId);
            if (isTaken) {
                return "error: Username tersebut sudah digunakan oleh pengguna lain";
            }
        }

        // 3. Enkripsi email jika diisi
        let encryptedEmail = undefined;
        let blindIdx = undefined;
        if (email !== undefined && email !== null && email.trim() !== "") {
            const normalized = normalizeEmail(email);
            blindIdx = computeBlindIndex(normalized);
            encryptedEmail = encryptEmail(normalized);
        }

        const targetUsername = username ? username.trim() : undefined;

        // 4. Update ke database
        await updateAccountProfile(userId, {
            username: targetUsername,
            encryptedEmail,
            blindIdx,
            passwordHash
        });

        // 5. Ambil data terbaru yang sudah ter-update
        return await getMyAccountService(userId);
    } catch (err) {
        console.log("error updateMyAccountService:", err);
        return "error karena: " + (err.message || err);
    }
}

export async function updateAccountByAdminService({ accountId, familyId, username, email, password }) {
    try {
        let targetUser = null;
        if (accountId) {
            const rows = await getAccountById(accountId);
            if (rows && rows.length > 0) targetUser = rows[0];
        } else if (familyId) {
            // Query TANPA password — admin gak perlu password user untuk update
            const [rows] = await pool.execute(`SELECT ${SAFE_COLUMNS_SQL} FROM acount WHERE family_id = ?`, [familyId]);
            if (rows && rows.length > 0) targetUser = rows[0];
        }

        if (!targetUser) {
            return "error: Akun warga tidak ditemukan untuk KK / ID tersebut";
        }

        let passwordHash = undefined;
        if (password && password.trim() !== "") {
            passwordHash = await argonhash(password.trim());
        }

        if (username && username.trim() !== targetUser.username) {
            const isTaken = await checkUsernameExistsExceptUser(username.trim(), targetUser.id);
            if (isTaken) {
                return "error: Username tersebut sudah digunakan oleh pengguna lain";
            }
        }

        let encryptedEmail = undefined;
        let blindIdx = undefined;
        if (email !== undefined && email !== null && email.trim() !== "") {
            const normalized = normalizeEmail(email);
            blindIdx = computeBlindIndex(normalized);
            encryptedEmail = encryptEmail(normalized);
        }

        const targetUsername = username ? username.trim() : undefined;

        await updateAccountProfile(targetUser.id, {
            username: targetUsername,
            encryptedEmail,
            blindIdx,
            passwordHash
        });

        return await getMyAccountService(targetUser.id);
    } catch (err) {
        console.log("error updateAccountByAdminService:", err);
        return "error karena: " + (err.message || err);
    }
}


