import { checkFamilyAccountExists, checkUsernameExists, createFamilyAccount, createStaffAccount, bindAccountToFamily, getAccountByFamilyId } from "../models/createAccount.js";
import { findAccountByBlindIndex } from "../models/register.js";
import { argonhash } from "../helpers/argon2.js";
import { normalizeEmail, computeBlindIndex, encryptEmail } from "../lib/crypto/email.js";

export async function generateWargaAccount(familyId, customUsername, customPassword, customEmail) {
    if (!familyId) {
        return "error: familyId wajib diisi";
    }
    if (!customUsername || !String(customUsername).trim()) {
        return "error: username wajib diisi";
    }
    if (!customPassword || !String(customPassword).trim()) {
        return "error: password wajib diisi";
    }
    if (!customEmail || !String(customEmail).trim()) {
        return "error: email wajib diisi";
    }

    try {
        // 1. Pastikan belum punya account
        const exists = await checkFamilyAccountExists(familyId);
        if (exists) {
            return "error: keluarga ini sudah punya akun masbro";
        }

        const username = String(customUsername).trim();
        const rawPassword = String(customPassword).trim();
        const normalized = normalizeEmail(customEmail);

        // 2. Pre-check duplikat username
        const isUsernameTaken = await checkUsernameExists(username);
        if (isUsernameTaken) {
            return "error: username ini sudah digunakan oleh akun lain masbro";
        }

        // 3. Pre-check duplikat email via blind index
        const blindIdx = computeBlindIndex(normalized);
        const isEmailTaken = await findAccountByBlindIndex(blindIdx);
        if (isEmailTaken) {
            return "error: email sudah terdaftar pada akun lain";
        }

        const encryptedEmail = encryptEmail(normalized);
        const passwordHash = await argonhash(rawPassword);

        // 4. Simpan ke database
        await createFamilyAccount(username, passwordHash, familyId, encryptedEmail, blindIdx);

        // 5. Kembalikan username & temporaryPassword untuk dicatat RT
        return { 
            username, 
            temporaryPassword: rawPassword 
        };
    } catch (err) {
        console.log(err);
        return "error karena: " + (err.message || err);
    }
}

export async function generateStaffAccount(username, password, email, role) {
    if (!username || !String(username).trim()) {
        return "error: username wajib diisi";
    }
    if (!password || !String(password).trim()) {
        return "error: password wajib diisi";
    }
    if (!email || !String(email).trim()) {
        return "error: email wajib diisi";
    }

    try {
        const cleanUsername = String(username).trim();
        const cleanPassword = String(password).trim();
        const normalized = normalizeEmail(email);

        // 1. Pre-check duplikat username
        const isUsernameTaken = await checkUsernameExists(cleanUsername);
        if (isUsernameTaken) {
            return "error: username ini sudah digunakan oleh akun lain masbro";
        }

        // 2. Pre-check duplikat email via blind index
        const blindIdx = computeBlindIndex(normalized);
        const isEmailTaken = await findAccountByBlindIndex(blindIdx);
        if (isEmailTaken) {
            return "error: email sudah terdaftar pada akun lain";
        }

        const encryptedEmail = encryptEmail(normalized);
        const passwordHash = await argonhash(cleanPassword);

        await createStaffAccount(cleanUsername, passwordHash, encryptedEmail, blindIdx, role);
        return { username: cleanUsername };
    } catch (err) {
        console.log(err);
        return "error karena: " + (err.message || err);
    }
}


export async function bindAccountToFamilyService(userId, familyId) {
    try {
        const result = await bindAccountToFamily(userId, familyId);
        return result;
    } catch (err) {
        console.log(err);
        return "error karena: " + err;
    }
}

export async function checkAccountStatusService(familyId) {
    try {
        const accountInfo = await getAccountByFamilyId(familyId);
        return {
            familyId: Number(familyId),
            family_id: Number(familyId),
            ...accountInfo
        };
    } catch (err) {
        console.log(err);
        return "error karena: " + err;
    }
}
