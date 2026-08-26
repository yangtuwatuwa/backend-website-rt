/**
 * sanitizeUser.js
 * 
 * Satu pintu untuk memastikan data sensitif user TIDAK PERNAH bocor ke client.
 * 
 * Kalau nanti ada kolom baru yang sensitif (misal: two_factor_secret, refresh_token, dll),
 * tinggal tambahkan ke SENSITIVE_FIELDS di sini. Semua endpoint otomatis terlindungi.
 */

// ======================================================================
// Daftar field yang WAJIB dihapus sebelum kirim response ke client.
// Tambahkan field baru di sini kalau nanti ada kolom sensitif baru.
// ======================================================================
const SENSITIVE_FIELDS = [
    "password",           // hash password (argon2)
    "temporaryPassword",  // plaintext temp password
    "temp_password",      // alias
    "email",              // encrypted email (kirim versi decrypted via service, bukan raw cipher)
    "email_encrypted",    // raw ciphertext
    "email_blind_idx",    // blind index
    "two_factor_secret",  // future: 2FA secret
    "refresh_token",      // future: refresh token
    "reset_token",        // future: password reset token
    "otp_secret",         // future: OTP secret
]

// Kolom aman yang boleh dikirim ke client — ini whitelist approach (lebih secure)
const SAFE_USER_FIELDS = [
    "id",
    "username",
    "role",
    "family_id",
    "must_change_password",
    "is_verified",
]

/**
 * BLACKLIST approach: Hapus field sensitif dari object user.
 * Cocok untuk case yang perlu preserve semua field kecuali yang sensitif.
 * 
 * @param {Object} user - Raw user object dari database
 * @returns {Object} User object tanpa field sensitif
 */
export function stripSensitiveFields(user) {
    if (!user || typeof user !== "object") return user

    const sanitized = { ...user }
    for (const field of SENSITIVE_FIELDS) {
        delete sanitized[field]
    }
    return sanitized
}

/**
 * WHITELIST approach (RECOMMENDED): Hanya ambil field yang aman.
 * Lebih secure karena field baru otomatis TIDAK ter-include kecuali di-whitelist.
 * 
 * @param {Object} user - Raw user object dari database
 * @param {string[]} extraFields - Field tambahan yang boleh di-include (optional)
 * @returns {Object} User object hanya dengan field yang aman
 */
export function toSafeUser(user, extraFields = []) {
    if (!user || typeof user !== "object") return user

    const allowedFields = [...SAFE_USER_FIELDS, ...extraFields]
    const safeUser = {}

    for (const field of allowedFields) {
        if (user[field] !== undefined) {
            safeUser[field] = user[field]
        }
    }
    return safeUser
}

/**
 * Sanitize array of user objects.
 * 
 * @param {Object[]} users - Array of raw user objects
 * @param {string[]} extraFields - Field tambahan yang boleh di-include (optional)
 * @returns {Object[]} Array of sanitized user objects
 */
export function toSafeUsers(users, extraFields = []) {
    if (!Array.isArray(users)) return []
    return users.map(user => toSafeUser(user, extraFields))
}

// SQL column list yang aman untuk SELECT (tanpa password & email)
export const SAFE_COLUMNS_SQL = "id, username, role, family_id, must_change_password, is_verified"

// SQL column list yang include password & encrypted email — HANYA untuk internal auth (login & verify)
export const AUTH_COLUMNS_SQL = "id, username, password, role, family_id, must_change_password, is_verified, email_encrypted, email_blind_idx"

