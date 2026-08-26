import crypto from "crypto";
import pool from "../config/sqlconfig.js";
import registerAccount, { findAccountByBlindIndex, findAccountByUsername } from "../models/register.js";
import loginAccount, { getAccountByBlindIndex } from "../models/login.js";
import { invalidatePreviousOtps, saveOtpCode } from "../models/otpModel.js";
import { sendOtpEmail } from "../utils/mailer.js";
import { argonhash, argonverify } from "../helpers/argon2.js";
import { normalizeEmail, computeBlindIndex, encryptEmail } from "../lib/crypto/email.js";
import { generateJwt } from "../helpers/jwttoken.js";
import { createAccessLog } from "../models/accessLogs.js";
import { toSafeUser } from "../helpers/sanitizeUser.js";

export async function register(username, password, email, role = "warga", familyId = null) {
    if (!email) {
        return "error: email wajib diisi";
    }
    const normalized = normalizeEmail(email);
    if (!normalized) {
        return "error: email wajib diisi";
    }
    if (!username || !String(username).trim()) {
        return "error: username wajib diisi";
    }
    if (!password || !String(password).trim()) {
        return "error: password wajib diisi";
    }

    const cleanUsername = String(username).trim();
    const cleanRole = role || "warga";
    const targetFamilyId = familyId || null;

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // 1. Validasi duplikasi username dalam transaksi
        const [existingUser] = await conn.execute(
            "SELECT id FROM acount WHERE username = ?",
            [cleanUsername]
        );
        if (existingUser && existingUser.length > 0) {
            await conn.rollback();
            return "error: username sudah digunakan";
        }

        // 2. Validasi duplikasi email via blind index dalam transaksi
        const blindIdx = computeBlindIndex(normalized);
        const [existingEmail] = await conn.execute(
            "SELECT id FROM acount WHERE email_blind_idx = ?",
            [blindIdx]
        );
        if (existingEmail && existingEmail.length > 0) {
            await conn.rollback();
            return "error: email sudah terdaftar";
        }

        // 3. Hash password & Encrypt email
        const passwordHash = await argonhash(password);
        const encryptedEmail = encryptEmail(normalized);

        // 4. Insert account baru ke tabel acount
        const [accountResult] = await conn.execute(
            "INSERT INTO acount (id, username, password, email_encrypted, email_blind_idx, role, family_id) VALUES (NULL, ?, ?, ?, ?, ?, ?)",
            [cleanUsername, passwordHash, encryptedEmail, blindIdx, cleanRole, targetFamilyId]
        );

        const newUserId = accountResult.insertId;
        if (!newUserId) {
            throw new Error("Gagal mendapatkan insertId akun baru");
        }

        // 5. Generate OTP dan simpan ke otp_codes menggunakan connection transaksi yang sama
        const otpCode = crypto.randomInt(100000, 1000000).toString();
        const otpHash = await argonhash(otpCode);

        await invalidatePreviousOtps(newUserId, 'VERIFICATION', conn);
        await saveOtpCode(newUserId, otpHash, 5, 'VERIFICATION', conn);

        // 6. Commit transaksi: akun dan OTP tersimpan secara atomic
        await conn.commit();

        console.log(`\n==========================================`);
        console.log(`🔑 [DEV DEBUG OTP] KODE OTP: ${otpCode} | userId: ${newUserId} | email: ${normalized} | purpose: VERIFICATION`);
        console.log(`==========================================\n`);

        // 7. Kirim email OTP via Nodemailer setelah transaksi commit berhasil di database
        try {
            await sendOtpEmail(normalized, otpCode);
            console.log(`[Register + OTP] OTP (${otpCode}) berhasil dikirim ke email: ${normalized} untuk userId: ${newUserId}`);
        } catch (mailErr) {
            console.error(`[Register + OTP] Peringatan: Gagal mengirim email OTP ke ${normalized}:`, mailErr.message || mailErr);
        }

        return {
            success: true,
            response: 201,
            message: "Registrasi berhasil, kode OTP telah dikirim ke email.",
            userId: newUserId,
            insertId: newUserId,
            user: {
                id: newUserId,
                username: cleanUsername,
                email: normalized,
                role: cleanRole,
                family_id: targetFamilyId
            }
        };

    } catch (err) {
        await conn.rollback();
        console.error("Error pada register:", err);
        return "error karena: " + (err.message || err);
    } finally {
        conn.release();
    }
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
         // Cek status verifikasi akun (is_verified)
         // Jika belum diverifikasi (is_verified === 0 / false), tolak login & jangan beri JWT token
         if (user.is_verified === 0 || user.is_verified === false) {
             await createAccessLog(user.username || identifier, "LOGIN_BLOCKED_UNVERIFIED", ipAddress, userAgent, "failed", "Akun belum diverifikasi OTP");
             return {
                 success: false,
                 status: "unverified",
                 userId: user.id,
                 message: "Akun belum diverifikasi. Silakan masukkan kode OTP."
             };
         }

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
