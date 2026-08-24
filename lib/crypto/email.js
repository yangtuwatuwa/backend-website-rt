import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config({ override: true });

/**
 * Validasi keberadaan ENCRYPTION_KEY dan HMAC_SECRET saat startup (fail-fast).
 */
export function validateCryptoKeys() {
    const encKey = process.env.ENCRYPTION_KEY;
    const hmacSecret = process.env.HMAC_SECRET;

    if (!encKey || encKey.trim() === "") {
        throw new Error("[FATAL ERROR] ENCRYPTION_KEY tidak ditemukan pada environment variable.");
    }
    if (!hmacSecret || hmacSecret.trim() === "") {
        throw new Error("[FATAL ERROR] HMAC_SECRET tidak ditemukan pada environment variable.");
    }
}

// Jalankan validasi otomatis saat file di-import
validateCryptoKeys();

/**
 * Mengambil Buffer 32-byte untuk AES-256-GCM dari ENCRYPTION_KEY.
 */
function getEncryptionKeyBuffer() {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
        throw new Error("ENCRYPTION_KEY missing");
    }
    if (/^[0-9a-fA-F]{64}$/.test(key)) {
        return Buffer.from(key, "hex");
    }
    return crypto.createHash("sha256").update(key).digest();
}

/**
 * Normalisasi string email: trim & lowercase.
 * @param {string} email
 * @returns {string}
 */
export function normalizeEmail(email) {
    if (!email || typeof email !== "string") return "";
    return email.trim().toLowerCase();
}

/**
 * Menghitung HMAC-SHA256 blind index dari email ter-normalisasi.
 * Output: 64 karakter string hex (CHAR(64))
 * @param {string} email
 * @returns {string}
 */
export function computeBlindIndex(email) {
    const normalized = normalizeEmail(email);
    const hmacSecret = process.env.HMAC_SECRET;
    if (!hmacSecret) {
        throw new Error("HMAC_SECRET missing");
    }
    return crypto.createHmac("sha256", hmacSecret).update(normalized).digest("hex");
}

/**
 * Mengenkripsi email menggunakan AES-256-GCM.
 * Output binary Buffer: IV (12 byte) + AuthTag (16 byte) + Ciphertext.
 * @param {string} email
 * @returns {Buffer}
 */
export function encryptEmail(email) {
    const normalized = normalizeEmail(email);
    const key = getEncryptionKeyBuffer();
    const iv = crypto.randomBytes(12);

    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return Buffer.concat([iv, authTag, ciphertext]);
}

/**
 * Mendekripsi email Buffer yang dihasilkan oleh encryptEmail.
 * Memvalidasi AuthTag (throw error jika tampered/corrupted).
 * @param {Buffer|Uint8Array} buffer
 * @returns {string}
 */
export function decryptEmail(buffer) {
    if (!buffer) return "";
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

    if (buf.length < 28) {
        throw new Error("Invalid encrypted email buffer: buffer too short");
    }

    const iv = buf.subarray(0, 12);
    const authTag = buf.subarray(12, 28);
    const ciphertext = buf.subarray(28);

    const key = getEncryptionKeyBuffer();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString("utf8");
}
