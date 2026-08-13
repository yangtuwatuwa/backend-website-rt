import db from "../config/sqlconfig.js";

/**
 * Nonaktifkan semua OTP lama milik user untuk purpose tertentu
 */
export async function invalidatePreviousOtps(userId, purpose = 'VERIFICATION') {
  const query = `
    UPDATE otp_codes 
    SET is_used = 1 
    WHERE user_id = ? AND purpose = ? AND is_used = 0
  `;
  const [result] = await db.execute(query, [userId, purpose]);
  return result;
}

/**
 * Simpan OTP hash baru ke database dengan durasi kedaluwarsa dalam menit berbasis waktu MySQL NOW()
 */
export async function saveOtpCode(userId, otpHash, durationMinutes = 5, purpose = 'VERIFICATION') {
  const query = `
    INSERT INTO otp_codes (user_id, otp_hash, purpose, expires_at) 
    VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))
  `;
  const [result] = await db.execute(query, [userId, otpHash, purpose, durationMinutes]);
  return result.insertId;
}

/**
 * Ambil OTP aktif terakhir milik user yang belum kedaluwarsa dan belum digunakan
 */
export async function getActiveOtp(userId, purpose = 'VERIFICATION') {
  const query = `
    SELECT * FROM otp_codes 
    WHERE user_id = ? AND purpose = ? AND is_used = 0 AND expires_at > NOW()
    ORDER BY created_at DESC 
    LIMIT 1
  `;
  const [rows] = await db.execute(query, [userId, purpose]);
  return rows[0] || null;
}

/**
 * Tambah jumlah percobaan gagal (+1)
 */
export async function incrementOtpAttempts(otpId) {
  const query = `UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?`;
  const [result] = await db.execute(query, [otpId]);
  return result;
}

/**
 * Tandai OTP telah digunakan (is_used = 1)
 */
export async function markOtpAsUsed(otpId) {
  const query = `UPDATE otp_codes SET is_used = 1 WHERE id = ?`;
  const [result] = await db.execute(query, [otpId]);
  return result;
}
