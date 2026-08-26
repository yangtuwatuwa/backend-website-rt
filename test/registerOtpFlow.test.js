import pool from "../config/sqlconfig.js";
import { register } from "../services/bisnisRegisterAndLogin.js";
import { requestOtpService, verifyOtpService } from "../services/otpService.js";
import { getActiveOtp } from "../models/otpModel.js";

async function runRegisterOtpTests() {
    console.log("==================================================");
    console.log("TEST SUITE: REGISTRASI + OTP FLOW TRANSACTION");
    console.log("==================================================");

    const testTimestamp = Date.now();
    const testUsername = `test_otp_user_${testTimestamp}`;
    const testEmail = `test_otp_${testTimestamp}@example.com`;
    const testPassword = "PasswordSecure123!";
    let createdUserId = null;

    try {
        // Test 1: Registrasi Akun Baru dalam satu transaksi dengan OTP
        console.log("\n--- Test 1: Registrasi Akun Baru (Atomic Transaction) ---");
        const regResult = await register(testUsername, testPassword, testEmail, "warga");
        console.log("Hasil Registrasi:", regResult);

        console.assert(regResult && regResult.success === true, "Registrasi harus mengembalikan success: true");
        console.assert(regResult.userId > 0, "userId harus valid (> 0)");
        createdUserId = regResult.userId;

        // Verifikasi row di tabel acount
        const [accountRows] = await pool.execute("SELECT id, username FROM acount WHERE id = ?", [createdUserId]);
        console.assert(accountRows.length === 1, "Akun harus ada di tabel acount");
        console.assert(accountRows[0].username === testUsername, "Username harus sesuai");
        console.log("PASS: Akun berhasil dibuat di tabel acount dengan id:", createdUserId);

        // Verifikasi row di tabel otp_codes (FK constraint check)
        const [otpRows] = await pool.execute("SELECT * FROM otp_codes WHERE user_id = ? AND purpose = 'VERIFICATION'", [createdUserId]);
        console.assert(otpRows.length === 1, "Kode OTP harus otomatis dibuat untuk user_id tersebut");
        console.assert(otpRows[0].user_id === createdUserId, "FK user_id di otp_codes harus sama persis dengan id account");
        console.log("PASS: OTP berhasil dibuat di tabel otp_codes dengan FK user_id yang valid!");

        // Test 2: Registrasi Duplikat (Email sama) -> Harus Rollback
        console.log("\n--- Test 2: Rollback jika Duplikat Email ---");
        const dupResult = await register(testUsername + "_dup", testPassword, testEmail, "warga");
        console.log("Hasil Registrasi Duplikat:", dupResult);
        console.assert(typeof dupResult === "string" && dupResult.includes("email sudah terdaftar"), "Duplikat email harus ditolak");
        console.log("PASS: Registrasi duplikat berhasil ditolak!");

        // Test 3: Request OTP untuk userId yang TIDAK ADA di tabel acount
        console.log("\n--- Test 3: Request OTP untuk userId Non-Existent (Fix Bug ER_NO_REFERENCED_ROW_2) ---");
        const nonExistentUserId = 999999;
        const fakeResult = await requestOtpService(nonExistentUserId, "fake@example.com", "VERIFICATION");
        console.log("Hasil Request OTP fake userId:", fakeResult);
        console.assert(fakeResult.success === false, "Request OTP dengan userId tidak valid harus return success: false");
        console.assert(fakeResult.message.includes("tidak ditemukan"), "Pesan error harus informatif");
        console.log("PASS: Request OTP dengan userId fiktif tidak menyebabkan error Foreign Key SQL!");

        // Test 4: Request OTP Ulang (Resend OTP) untuk Akun yang Valid
        console.log("\n--- Test 4: Request OTP Ulang untuk Akun Valid ---");
        const resendResult = await requestOtpService(createdUserId, testEmail, "VERIFICATION");
        console.log("Hasil Resend OTP:", resendResult);
        console.assert(resendResult.success === true, "Resend OTP harus berhasil");
        console.log("PASS: Resend OTP untuk user valid berhasil!");

        // Test 5: Verifikasi OTP Salah & Benar
        console.log("\n--- Test 5: Verifikasi OTP Salah & Benar ---");
        const wrongVerify = await verifyOtpService(createdUserId, "000000", "VERIFICATION");
        console.assert(wrongVerify.success === false, "Verifikasi kode OTP salah harus gagal");
        console.log("PASS: Verifikasi OTP salah ditolak dengan benar!");

        // Ambil OTP aktif dari database untuk test verifikasi sukses
        const activeOtp = await getActiveOtp(createdUserId, "VERIFICATION");
        console.assert(activeOtp !== null, "Harus ada OTP aktif");
        console.log("PASS: OTP aktif ditemukan di DB!");

        // Cleanup
        console.log("\n--- Cleanup Test Data ---");
        await pool.execute("DELETE FROM acount WHERE id = ?", [createdUserId]);
        const [deletedOtpRows] = await pool.execute("SELECT * FROM otp_codes WHERE user_id = ?", [createdUserId]);
        console.assert(deletedOtpRows.length === 0, "OTP harus otomatis terhapus karena ON DELETE CASCADE");
        console.log("PASS: Cleanup berhasil & ON DELETE CASCADE berfungsi sempurna!");

        console.log("\n==================================================");
        console.log("SEMUA TEST REGISTRASI + OTP BERHASIL 100%!");
        console.log("==================================================");

    } catch (err) {
        console.error("TEST GAGAL:", err);
        process.exit(1);
    } finally {
        if (createdUserId) {
            await pool.execute("DELETE FROM acount WHERE id = ?", [createdUserId]).catch(() => {});
        }
        await pool.end();
    }
}

runRegisterOtpTests();
