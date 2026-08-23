import crypto from 'crypto';
import { argonhash, argonverify } from '../helpers/argon2.js';
import { sendOtpEmail } from '../utils/mailer.js';
import { normalizeEmail, computeBlindIndex } from '../lib/crypto/email.js';
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
 * Generate OTP, Hash, simpan ke database, dan kirim via email Nodemailer
 * @param {number|string} userId 
 * @param {string} email 
 * @param {string} purpose 
 */
export async function requestOtpService(userId, email, purpose = 'VERIFICATION') {
  try {
    // 1. Validasi duplikat email khusus untuk registrasi/verifikasi akun baru
    if (purpose === 'VERIFICATION' || purpose === 'REGISTRATION') {
      const cleanEmail = (email || '').trim();
      const normalized = normalizeEmail(cleanEmail);
      const blindIdx = computeBlindIndex(normalized);
      const isEmailTaken = await findAccountByBlindIndex(blindIdx);
      if (isEmailTaken) {
        return {
          success: false,
          message: "Email sudah terdaftar pada akun lain"
        };
      }
    }

    // 2. Nonaktifkan OTP lama yang belum terpakai milik user ini
    await invalidatePreviousOtps(userId, purpose);

    // 2. Generate 6 digit angka acak yang aman (100000 - 999999)
    const otpCode = crypto.randomInt(100000, 1000000).toString();

    console.log(`\n==========================================`);
    console.log(`🔑 [DEV DEBUG OTP] KODE OTP: ${otpCode} | userId: ${userId} | email: ${email} | purpose: ${purpose}`);
    console.log(`==========================================\n`);

    // 3. Hash OTP menggunakan Argon2
    const otpHash = await argonhash(otpCode);

    // 4. Simpan hash OTP ke MySQL dengan durasi 5 menit (menggunakan DATE_ADD(NOW(), INTERVAL 5 MINUTE))
    await saveOtpCode(userId, otpHash, 5, purpose);

    // 5. Kirim email via Nodemailer
    await sendOtpEmail(email, otpCode);

    console.log(`[OTP Service] OTP (${otpCode}) berhasil dikirim untuk userId: ${userId}`);

    return { success: true, message: "Kode OTP berhasil dikirim ke email." };
  } catch (error) {
    console.error("Error pada requestOtpService:", error);
    throw error;
  }
}

/**
 * Verifikasi kode OTP dari input user
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

    return { success: true, message: "Verifikasi OTP berhasil!" };
  } catch (error) {
    console.error("Error pada verifyOtpService:", error);
    throw error;
  }
}
