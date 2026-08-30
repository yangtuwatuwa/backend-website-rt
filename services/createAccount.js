import crypto from "crypto";
import pool from "../config/sqlconfig.js";
import { checkFamilyAccountExists, checkUsernameExists, createFamilyAccount, createStaffAccount, bindAccountToFamily, getAccountByFamilyId } from "../models/createAccount.js";
import { findAccountByBlindIndex } from "../models/register.js";
import { invalidatePreviousOtps, saveOtpCode } from "../models/otpModel.js";
import { sendOtpEmail } from "../utils/mailer.js";
import { argonhash } from "../helpers/argon2.js";
import { normalizeEmail, computeBlindIndex, encryptEmail } from "../lib/crypto/email.js";

const SHOULD_LOG_PLAINTEXT_OTP = process.env.NODE_ENV !== "production";
let generateWargaAccountSavepointCounter = 0;

export async function generateWargaAccount(familyId, customUsername, customPassword, customEmail, executor = undefined) {
    if (!familyId) {
        return "error: familyId wajib diisi";
    }
    if (!customUsername || !String(customUsername).trim()) {
        return "error: username wajib diisi";
    }
    if (!customPassword || !String(customPassword).trim()) {
        return "error: password wajib diisi";
    }
    if (!customEmail || !String(customEmail).trim()) {
        return "error: email wajib diisi";
    }

    const username = String(customUsername).trim();
    const rawPassword = String(customPassword).trim();
    const normalized = normalizeEmail(customEmail);

    if (!normalized) {
        return "error: format email tidak valid";
    }

    const ownsTransaction = !executor;
    const conn = executor || await pool.getConnection();
    const savepointName = ownsTransaction
        ? null
        : `sp_generate_warga_account_${++generateWargaAccountSavepointCounter}`;
    let transactionStarted = false;
    let savepointCreated = false;

    try {
        if (ownsTransaction) {
            await conn.beginTransaction();
            transactionStarted = true;
        }

        // 1. Pastikan keluarga belum punya account
        const exists = await checkFamilyAccountExists(familyId, conn);
        if (exists) {
            if (transactionStarted) {
                await conn.rollback();
                transactionStarted = false;
            }
            return "error: keluarga ini sudah punya akun masbro";
        }

        // 2. Pre-check duplikat username dalam transaksi
        const isUsernameTaken = await checkUsernameExists(username, conn);
        if (isUsernameTaken) {
            if (transactionStarted) {
                await conn.rollback();
                transactionStarted = false;
            }
            return "error: username ini sudah digunakan oleh akun lain masbro";
        }

        // 3. Pre-check duplikat email via blind index dalam transaksi
        const blindIdx = computeBlindIndex(normalized);
        const isEmailTaken = await findAccountByBlindIndex(blindIdx, conn);
        if (isEmailTaken) {
            if (transactionStarted) {
                await conn.rollback();
                transactionStarted = false;
            }
            return "error: email sudah terdaftar pada akun lain";
        }

        const encryptedEmail = encryptEmail(normalized);
        const passwordHash = await argonhash(rawPassword);

        if (savepointName) {
            await conn.query(`SAVEPOINT ${savepointName}`);
            savepointCreated = true;
        }

        // 4. Simpan ke database acount (must_change_password = 1, is_verified = 0)
        const result = await createFamilyAccount(username, passwordHash, familyId, encryptedEmail, blindIdx, conn);
        const newUserId = result.insertId;

        if (!newUserId) {
            throw new Error("Gagal mendapatkan insertId akun baru");
        }

        // 5. Generate OTP dan simpan ke otp_codes dalam transaksi yang sama
        const otpCode = crypto.randomInt(100000, 1000000).toString();
        const otpHash = await argonhash(otpCode);

        await invalidatePreviousOtps(newUserId, 'VERIFICATION', conn);
        await saveOtpCode(newUserId, otpHash, 5, 'VERIFICATION', conn);

        // 6. Commit transaksi: akun dan OTP tersimpan secara atomic
        if (ownsTransaction) {
            await conn.commit();
            transactionStarted = false;
        } else if (savepointCreated) {
            await conn.query(`RELEASE SAVEPOINT ${savepointName}`);
            savepointCreated = false;
        }

        if (SHOULD_LOG_PLAINTEXT_OTP) {
            console.log(`\n==========================================`);
            console.log(`🔑 [DEV DEBUG OTP] KODE OTP (ADMIN CREATE): ${otpCode} | userId: ${newUserId} | email: ${normalized} | purpose: VERIFICATION`);
            console.log(`==========================================\n`);
        }

        // 7. Kirim email OTP via Nodemailer setelah transaksi commit berhasil di database
        try {
            await sendOtpEmail(normalized, otpCode);
            if (SHOULD_LOG_PLAINTEXT_OTP) {
                console.log(`[Admin Create Account + OTP] OTP (${otpCode}) berhasil dikirim ke email: ${normalized} untuk userId: ${newUserId}`);
            } else {
                console.log(`[Admin Create Account + OTP] OTP berhasil dikirim ke email akun untuk userId: ${newUserId}`);
            }
        } catch (mailErr) {
            console.error(`[Admin Create Account + OTP] Peringatan: Gagal mengirim email OTP ke ${normalized}:`, mailErr.message || mailErr);
        }

        // 8. Kembalikan payload valid dengan userId / insertId untuk frontend
        return { 
            success: true,
            userId: newUserId,
            insertId: newUserId,
            username, 
            temporaryPassword: rawPassword,
            message: "Akun berhasil dibuat dan kode OTP verifikasi telah dikirim ke email warga."
        };
    } catch (err) {
        if (transactionStarted) {
            try {
                await conn.rollback();
            } catch (rollbackErr) {
                console.log("Error rollback generateWargaAccount:", rollbackErr);
            }
            transactionStarted = false;
        } else if (savepointCreated) {
            try {
                await conn.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
            } catch (rollbackErr) {
                console.log("Error rollback savepoint generateWargaAccount:", rollbackErr);
            }

            try {
                await conn.query(`RELEASE SAVEPOINT ${savepointName}`);
            } catch (releaseErr) {
                console.log("Error release savepoint generateWargaAccount:", releaseErr);
            }
        }

        console.log("Error pada generateWargaAccount:", err);
        return "error karena: " + (err.message || err);
    } finally {
        if (ownsTransaction) {
            conn.release();
        }
    }
}

export async function generateStaffAccount(username, password, email, role, executor = pool) {
    if (!username || !String(username).trim()) {
        return "error: username wajib diisi";
    }
    if (!password || !String(password).trim()) {
        return "error: password wajib diisi";
    }
    if (!email || !String(email).trim()) {
        return "error: email wajib diisi";
    }

    try {
        const client = executor || pool;
        const cleanUsername = String(username).trim();
        const cleanPassword = String(password).trim();
        const normalized = normalizeEmail(email);

        // 1. Pre-check duplikat username
        const isUsernameTaken = await checkUsernameExists(cleanUsername, client);
        if (isUsernameTaken) {
            return "error: username ini sudah digunakan oleh akun lain masbro";
        }

        // 2. Pre-check duplikat email via blind index
        const blindIdx = computeBlindIndex(normalized);
        const isEmailTaken = await findAccountByBlindIndex(blindIdx, client);
        if (isEmailTaken) {
            return "error: email sudah terdaftar pada akun lain";
        }

        const encryptedEmail = encryptEmail(normalized);
        const passwordHash = await argonhash(cleanPassword);

        const result = await createStaffAccount(cleanUsername, passwordHash, encryptedEmail, blindIdx, role, client);
        return { 
            userId: result.insertId,
            insertId: result.insertId,
            username: cleanUsername 
        };
    } catch (err) {
        console.log(err);
        return "error karena: " + (err.message || err);
    }
}


export async function bindAccountToFamilyService(userId, familyId, executor = pool) {
    try {
        const client = executor || pool;
        const result = await bindAccountToFamily(userId, familyId, client);
        return result;
    } catch (err) {
        console.log(err);
        return "error karena: " + err;
    }
}

export async function checkAccountStatusService(familyId, executor = pool) {
    try {
        const client = executor || pool;
        const accountInfo = await getAccountByFamilyId(familyId, client);
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
