import { checkFamilyAccountExists, createFamilyAccount, createStaffAccount } from "../models/createAccount.js";
import { argonhash } from "../helpers/argon2.js";
import { encryptEmails } from "../helpers/ciihper.js";

function generateTempPassword() {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%";
    let password = "";
    for (let i = 0; i < 8; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

export async function generateWargaAccount(familyId) {
    try {
        // 1. Pastikan belum punya account
        const exists = await checkFamilyAccountExists(familyId);
        if (exists) {
            return "error: keluarga ini sudah punya akun masbro";
        }

        // 2. Generate username & password sementara
        const username = `keluarga_${familyId}`;
        const tempPassword = generateTempPassword();

        // 3. Hash password sementara
        const passwordHash = await argonhash(tempPassword);

        // 4. Simpan ke database
        await createFamilyAccount(username, passwordHash, familyId);

        // 5. Kembalikan username & password plain untuk dicatat RT
        return { username, temporaryPassword: tempPassword };
    } catch (err) {
        console.log(err);
        return "error karena: " + err;
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
