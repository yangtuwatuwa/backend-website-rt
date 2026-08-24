import registerAccount, { findAccountByBlindIndex } from "../models/register.js";
import loginAccount, { getAccountByBlindIndex } from "../models/login.js";
import { argonhash, argonverify } from "../helpers/argon2.js";
import { normalizeEmail, computeBlindIndex, encryptEmail } from "../lib/crypto/email.js";
import { generateJwt } from "../helpers/jwttoken.js";
import { createAccessLog } from "../models/accessLogs.js";
import { toSafeUser } from "../helpers/sanitizeUser.js";

export async function register(username, password, email, role = "warga", familyId = null) {
    const normalized = normalizeEmail(email);
    if (!normalized) {
        return "error: email wajib diisi";
    }

    const blindIdx = computeBlindIndex(normalized);
    const exists = await findAccountByBlindIndex(blindIdx);
    if (exists) {
        return "error: email sudah terdaftar";
    }

    const pasplaintext = await argonhash(password);
    const encryptedEmail = encryptEmail(normalized);
    const hasilny = await registerAccount(username, pasplaintext, encryptedEmail, blindIdx, role, familyId);
    return hasilny; 
}

export async function loginUser(usernameOrEmail, password, ipAddress = "127.0.0.1", userAgent = "unknown"){
    let hasilny;
    const identifier = usernameOrEmail ? usernameOrEmail.trim() : "";

    // Jika identifier mengandung '@', lakukan lookup cepat menggunakan email_blind_idx
    if (identifier.includes("@")) {
        const blindIdx = computeBlindIndex(identifier);
        hasilny = await getAccountByBlindIndex(blindIdx);
    } else {
        hasilny = await loginAccount(identifier);
    }

    if (hasilny === "error") {
        await createAccessLog(identifier, "LOGIN_ATTEMPT", ipAddress, userAgent, "failed", "DB error");
        return "error";
    }
    if (!Array.isArray(hasilny) || hasilny.length === 0) {
        await createAccessLog(identifier, "LOGIN_ATTEMPT", ipAddress, userAgent, "failed", "Akun tidak ditemukan");
        return "username atau email tidak ditemukan";
    }

    const user = hasilny[0];
    const checkPassword = await argonverify(user.password, password);
    
    if (checkPassword === true) {
         const token = generateJwt({
            id: user.id,
            role: user.role
         });
         
         await createAccessLog(user.username || identifier, "LOGIN_SUCCESS", ipAddress, userAgent, "success", `Role: ${user.role}`);

         // Sanitize: JANGAN pernah kirim password hash ke client
         const safeUser = toSafeUser(user);

         if (user.must_change_password === 1) {
             return { status: "must_change_password", user: safeUser, token: token };
         }
         return { status: "login berhasil", user: safeUser, token: token };
    } else {
        await createAccessLog(user.username || identifier, "LOGIN_FAILED", ipAddress, userAgent, "failed", "Password salah");
        return "password salah";
    }
}
