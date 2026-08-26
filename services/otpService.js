import crypto from 'crypto';
import db from '../config/sqlconfig.js';
import { argonhash, argonverify } from '../helpers/argon2.js';
import { sendOtpEmail } from '../utils/mailer.js';
import { normalizeEmail, computeBlindIndex, decryptEmail } from '../lib/crypto/email.js';
import { findAccountByBlindIndex } from '../models/register.js';
import { 
  invalidatePreviousOtps, 
  saveOtpCode, 
  getActiveOtp, 
  incrementOtpAttempts, 
  markOtpAsUsed 
} from '../models/otpModel.js';

const MAX_ATTEMPTS = 3;

/**
 * Generate OTP, Hash, simpan ke database, dan kirim via email Nodemailer.
 * Mendukung pemanggilan hanya dengan userId (resend OTP) atau email.
 * @param {number|string} userId 
 * @param {string} [email] 
 * @param {string} [purpose='VERIFICATION'] 
 */
export async function requestOtpService(userId, email, purpose = 'VERIFICATION') {
  try {
    if (!userId && !email) {
      return {
        success: false,
        message: "userId atau email wajib diisi!"
      };
    }

    let targetEmail = (email || '').trim();
    let targetUserId = userId;

    // 1. Validasi keberadaan akun di tabel acount
    if (targetUserId) {
      const [userRows] = await db.execute(
        "SELECT id, email_encrypted FROM acount WHERE id = ?",
        [targetUserId]
      );

      if (!userRows || userRows.length === 0) {
        console.warn(`[OTP Service] Warning: userId ${targetUserId} tidak ditemukan di tabel acount.`);
        return {
          success: false,
          message: `Akun dengan userId ${targetUserId} tidak ditemukan.`
        };
      }

      // Jika email tidak disediakan di request, dekripsi email dari database
      if (!targetEmail && userRows[0].email_encrypted) {
        try {
          targetEmail = decryptEmail(userRows[0].email_encrypted);
        } catch (decErr) {
          console.error(`[OTP Service] Gagal mendekripsi email userId ${targetUserId}:`, decErr);
        }
      }
    } else if (targetEmail) {
      const normalized = normalizeEmail(targetEmail);
      const blindIdx = computeBlindIndex(normalized);
      const [userRows] = await db.execute(
        "SELECT id FROM acount WHERE email_blind_idx = ?",
        [blindIdx]
      );
      if (!userRows || userRows.length === 0) {
        return {
          success: false,
          message: `Akun dengan email ${targetEmail} tidak ditemukan.`
        };
      }
      targetUserId = userRows[0].id;
      targetEmail = normalized;
    }

    if (!targetEmail) {
      return {
        success: false,
        message: "Email akun tidak ditemukan untuk mengirimkan kode OTP."
      };
    }

    // 2. Nonaktifkan OTP lama yang belum terpakai milik user ini
    await invalidatePreviousOtps(targetUserId, purpose);

    // 3. Generate 6 digit angka acak yang aman (100000 - 999999)
    const otpCode = crypto.randomInt(100000, 1000000).toString();

    console.log(`\n==========================================`);
    console.log(`🔑 [DEV DEBUG OTP] KODE OTP (REQUEST/RESEND): ${otpCode} | userId: ${targetUserId} | email: ${targetEmail} | purpose: ${purpose}`);
    console.log(`==========================================\n`);

    // 4. Hash OTP menggunakan Argon2
    const otpHash = await argonhash(otpCode);

    // 5. Simpan hash OTP ke MySQL dengan durasi 5 menit
    await saveOtpCode(targetUserId, otpHash, 5, purpose);

    // 6. Kirim email via Nodemailer
    try {
      await sendOtpEmail(targetEmail, otpCode);
      console.log(`[OTP Service] OTP (${otpCode}) berhasil dikirim untuk userId: ${targetUserId}`);
    } catch (mailErr) {
      console.error(`[OTP Service] Peringatan: Gagal mengirim email OTP ke ${targetEmail}:`, mailErr.message || mailErr);
    }

    return { 
      success: true, 
      userId: targetUserId,
      message: "Kode OTP berhasil dikirim ke email." 
    };
  } catch (error) {
    console.error("Error pada requestOtpService:", error);
    throw error;
  }
}

/**
 * Verifikasi kode OTP dari input user.
 * Jika purpose = 'VERIFICATION' dan kode valid -> UPDATE acount SET is_verified = 1.
 * @param {number|string} userId 
 * @param {string|number} inputOtp 
 * @param {string} purpose 
 */
export async function verifyOtpService(userId, inputOtp, purpose = 'VERIFICATION') {
  try {
    // Convert inputOtp ke String & trim untuk menghindari error tipe data Number vs String
    const cleanOtp = String(inputOtp).trim();

    // 1. Ambil OTP aktif milik user
    const activeOtp = await getActiveOtp(userId, purpose);

    if (!activeOtp) {
      return { success: false, message: "Kode OTP tidak valid atau sudah kedaluwarsa." };
    }

    const otpHash = activeOtp.otp_hash || activeOtp.otpHash;

    // 2. Cek apakah batas percobaan salah sudah tercapai
    if (activeOtp.attempts >= MAX_ATTEMPTS) {
      await markOtpAsUsed(activeOtp.id);
      return { success: false, message: "Batas percobaan OTP telah habis. Silakan minta kode OTP baru." };
    }

    // 3. Verifikasi hash OTP menggunakan argon2
    const isValid = await argonverify(otpHash, cleanOtp);

    if (!isValid) {
      console.log(`❌ [DEV DEBUG OTP] VERIFIKASI GAGAL | userId: ${userId} | input: "${cleanOtp}"`);
      // Increment percobaan gagal
      await incrementOtpAttempts(activeOtp.id);
      const remainingAttempts = MAX_ATTEMPTS - (activeOtp.attempts + 1);

      if (remainingAttempts <= 0) {
        await markOtpAsUsed(activeOtp.id);
        return { success: false, message: "Kode OTP salah. Batas percobaan habis, silakan minta OTP baru." };
      }

      return { 
        success: false, 
        message: `Kode OTP salah. Sisa percobaan: ${remainingAttempts}` 
      };
    }

    console.log(`✅ [DEV DEBUG OTP] VERIFIKASI BERHASIL | userId: ${userId} | input: "${cleanOtp}"`);
    // 4. Jika BENAR -> Tandai OTP sebagai digunakan (is_used = 1) agar tidak bisa Replay Attack
    await markOtpAsUsed(activeOtp.id);

    // 5. UPDATE status verifikasi akun menjadi aktif (is_verified = 1) jika purpose adalah VERIFICATION
    if (purpose === 'VERIFICATION') {
      await db.execute("UPDATE acount SET is_verified = 1 WHERE id = ?", [userId]);
      console.log(`✅ [OTP Service] Status akun userId ${userId} berhasil diperbarui: is_verified = 1`);
    }

    return { 
      success: true, 
      userId: Number(userId),
      is_verified: 1,
      message: "Verifikasi OTP berhasil!" 
    };
  } catch (error) {
    console.error("Error pada verifyOtpService:", error);
    throw error;
  }
}
