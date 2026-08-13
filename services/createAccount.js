import { checkFamilyAccountExists, createFamilyAccount, createStaffAccount, bindAccountToFamily, getAccountByFamilyId } from "../models/createAccount.js";
import { argonhash } from "../helpers/argon2.js";
import { encryptEmails } from "../helpers/ciihper.js";
import crypto from "crypto";

function generateTempPassword() {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%";
    // crypto.randomBytes: cryptographically secure, bukan Math.random yang predictable
    return Array.from(crypto.randomBytes(12))
        .map(byte => chars[byte % chars.length])
        .join("");
}

export async function generateWargaAccount(familyId, customUsername, customPassword) {
    try {
        // 1. Pastikan belum punya account
        const exists = await checkFamilyAccountExists(familyId);
        if (exists) {
            return "error: keluarga ini sudah punya akun masbro";
        }

        // 2. Tentukan username & password (gunakan inputan jika ada, atau generate fallback jika tidak ada)
        const username = (customUsername && customUsername.trim()) ? customUsername.trim() : `keluarga_${familyId}`;
        const finalPassword = customPassword || generateTempPassword();

        // 3. Hash password
        const passwordHash = await argonhash(finalPassword);

        // 4. Simpan ke database
        await createFamilyAccount(username, passwordHash, familyId);

        // 5. Kembalikan username & temporaryPassword SAJA untuk dicatat RT
        //    JANGAN kirim field "password" — itu ambiguous (bisa dikira hash)
        return { 
            username, 
            temporaryPassword: finalPassword 
        };
    } catch (err) {
        console.log(err);
        if (err.code === 'ER_DUP_ENTRY') {
            return "error: username ini sudah digunakan oleh akun lain masbro";
        }
        return "error karena: " + (err.message || err);
    }
}

export async function generateStaffAccount(username, password, email, role) {
    try {
        const passwordHash = await argonhash(password);
        const encryptedEmail = email ? encryptEmails(email) : null;
        await createStaffAccount(username, passwordHash, encryptedEmail, role);
        return { username };
    } catch (err) {
        console.log(err);
        return "error karena: " + err;
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
