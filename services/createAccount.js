import { checkFamilyAccountExists, createFamilyAccount } from "../models/createAccount.js";
import { argonhash } from "../helpers/argon2.js";

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
