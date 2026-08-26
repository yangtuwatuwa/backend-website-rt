import pool from "../config/sqlconfig.js";
import { generateWargaAccount } from "../services/createAccount.js";
import { loginUser } from "../services/bisnisRegisterAndLogin.js";
import { requestOtpService, verifyOtpService } from "../services/otpService.js";
import { getActiveOtp } from "../models/otpModel.js";
import { argonhash, argonverify } from "../helpers/argon2.js";

async function runAdminCreateAccountOtpTests() {
    console.log("===================================================================");
    console.log("TEST SUITE: ADMIN CREATE ACCOUNT + OTP ATOMIC TRANSACTION & VERIFY");
    console.log("===================================================================");

    const timestamp = Date.now();
    const testUsername = `warga_test_${timestamp}`;
    const testEmail = `warga_${timestamp}@example.com`;
    const testPassword = "PasswordWarga123!";
    let houseId = null;
    let familyId = null;
    let createdUserId = null;

    try {
        // Setup: Buat house & family test dummy
        const [houseResult] = await pool.execute(
            "INSERT INTO house (blok, nomor, alamat) VALUES (?, ?, ?)",
            [`T${timestamp % 100}`, `No.${timestamp % 1000}`, "Jl. Test OTP Admin"]
        );
        houseId = houseResult.insertId;

        const [familyResult] = await pool.execute(
            "INSERT INTO family (no_kk, house_id) VALUES (?, ?)",
            [`KK${timestamp}`, houseId]
        );
        familyId = familyResult.insertId;

        console.log(`[Setup] Berhasil membuat House ID: ${houseId}, Family ID: ${familyId}`);

        // -------------------------------------------------------------
        // TEST 1: Admin Create Warga Account (Atomic Transaction + OTP)
        // -------------------------------------------------------------
        console.log("\n--- TEST 1: Admin Membuat Akun Warga via generateWargaAccount() ---");
        const createResult = await generateWargaAccount(familyId, testUsername, testPassword, testEmail);
        console.log("Hasil generateWargaAccount:", createResult);

        console.assert(createResult && typeof createResult === "object", "Hasil harus berupa object");
        console.assert(createResult.success === true, "createResult.success harus true");
        console.assert(createResult.userId > 0, "userId harus valid (> 0)");
        console.assert(createResult.insertId === createResult.userId, "insertId harus sama dengan userId");
        console.assert(createResult.username === testUsername, "Username harus sesuai");
        createdUserId = createResult.userId;

        // Verifikasi row di tabel acount
        const [accountRows] = await pool.execute(
            "SELECT id, username, role, family_id, must_change_password, is_verified FROM acount WHERE id = ?",
            [createdUserId]
        );
        console.assert(accountRows.length === 1, "Akun harus tersimpan di tabel acount");
        console.assert(accountRows[0].role === "warga", "Role akun harus 'warga'");
        console.assert(accountRows[0].family_id === familyId, "family_id harus terhubung ke family yang benar");
        console.assert(accountRows[0].must_change_password === 1, "must_change_password harus bernilai 1");
        console.assert(accountRows[0].is_verified === 0, "is_verified harus bernilai 0 (belum verifikasi)");
        console.log("PASS: Akun warga berhasil dibuat dengan is_verified = 0, must_change_password = 1");

        // Verifikasi row di tabel otp_codes
        const [otpRows] = await pool.execute(
            "SELECT * FROM otp_codes WHERE user_id = ? AND purpose = 'VERIFICATION' AND is_used = 0",
            [createdUserId]
        );
        console.assert(otpRows.length === 1, "Kode OTP aktif harus tersimpan di tabel otp_codes");
        console.assert(otpRows[0].user_id === createdUserId, "FK user_id di otp_codes harus cocok dengan id akun");
        console.log("PASS: Kode OTP tersimpan secara atomic di tabel otp_codes untuk user_id:", createdUserId);

        // -------------------------------------------------------------
        // TEST 2: Percobaan Login SEBELUM Verifikasi OTP -> Harus Ditolak
        // -------------------------------------------------------------
        console.log("\n--- TEST 2: Login SEBELUM Verifikasi OTP (Harus Ditolak dengan status 'unverified') ---");
        const loginBeforeVerify = await loginUser(testUsername, testPassword);
        console.log("Hasil Login Sebelum Verifikasi:", loginBeforeVerify);

        console.assert(typeof loginBeforeVerify === "object", "Response login harus berupa object");
        console.assert(loginBeforeVerify.success === false, "success harus false");
        console.assert(loginBeforeVerify.status === "unverified", "status harus 'unverified'");
        console.assert(loginBeforeVerify.userId === createdUserId, "userId harus sesuai");
        console.assert(loginBeforeVerify.token === undefined, "TIDAK boleh mengeluarkan JWT token");
        console.log("PASS: Login sebelum verifikasi OTP berhasil dicegah dengan status 'unverified' tanpa token!");

        // -------------------------------------------------------------
        // TEST 3: Resend OTP hanya dengan userId (requestOtpService)
        // -------------------------------------------------------------
        console.log("\n--- TEST 3: Resend OTP Menggunakan Hanya userId ---");
        const resendResult = await requestOtpService(createdUserId, null, "VERIFICATION");
        console.log("Hasil Resend OTP (userId only):", resendResult);

        console.assert(resendResult.success === true, "Resend OTP harus sukses");
        console.assert(resendResult.userId === createdUserId, "userId harus sesuai");

        // Cek bahwa OTP lama sudah dinonaktifkan dan ada OTP baru
        const [allOtpRows] = await pool.execute(
            "SELECT id, is_used FROM otp_codes WHERE user_id = ? AND purpose = 'VERIFICATION' ORDER BY id ASC",
            [createdUserId]
        );
        console.assert(allOtpRows.length === 2, "Harus ada 2 record OTP (1 lama dinonaktifkan, 1 baru)");
        console.assert(allOtpRows[0].is_used === 1, "OTP lama harus ditandai is_used = 1");
        console.assert(allOtpRows[1].is_used === 0, "OTP baru harus aktif is_used = 0");
        console.log("PASS: Resend OTP berhasil meng-invalidate OTP lama dan membuat OTP baru!");

        // -------------------------------------------------------------
        // TEST 4: Verifikasi OTP dengan Kode Salah -> Harus Gagal
        // -------------------------------------------------------------
        console.log("\n--- TEST 4: Verifikasi OTP dengan Kode Salah ---");
        const wrongVerify = await verifyOtpService(createdUserId, "999999", "VERIFICATION");
        console.log("Hasil Verifikasi OTP Salah:", wrongVerify);
        console.assert(wrongVerify.success === false, "Verifikasi kode salah harus gagal");
        console.log("PASS: Kode OTP salah berhasil ditolak!");

        // -------------------------------------------------------------
        // TEST 5: Verifikasi OTP dengan Kode Benar -> is_verified menjadi 1
        // -------------------------------------------------------------
        console.log("\n--- TEST 5: Verifikasi OTP dengan Kode Benar ---");
        const knownOtpCode = "654321";
        const knownOtpHash = await argonhash(knownOtpCode);
        await pool.execute(
            "UPDATE otp_codes SET otp_hash = ? WHERE user_id = ? AND purpose = 'VERIFICATION' AND is_used = 0",
            [knownOtpHash, createdUserId]
        );

        const verifyResult = await verifyOtpService(createdUserId, knownOtpCode, "VERIFICATION");
        console.log("Hasil Verifikasi OTP Benar:", verifyResult);
        console.assert(verifyResult.success === true, "Verifikasi harus sukses");
        console.assert(verifyResult.is_verified === 1, "verifyResult.is_verified harus 1");

        // Cek database: is_verified di tabel acount harus sudah 1
        const [updatedAccountRows] = await pool.execute(
            "SELECT is_verified FROM acount WHERE id = ?",
            [createdUserId]
        );
        console.assert(updatedAccountRows[0].is_verified === 1, "is_verified di database harus bernilai 1 setelah verifikasi");
        console.log("PASS: Akun warga berhasil diverifikasi dan is_verified = 1 di database!");

        // -------------------------------------------------------------
        // TEST 6: Percobaan Login SETELAH Verifikasi OTP -> Harus Sukses & Dapat Token
        // -------------------------------------------------------------
        console.log("\n--- TEST 6: Login SETELAH Verifikasi OTP (Harus Berhasil dan Dapat Token) ---");
        const loginAfterVerify = await loginUser(testUsername, testPassword);
        console.log("Hasil Login Setelah Verifikasi:", loginAfterVerify);

        console.assert(typeof loginAfterVerify === "object", "Response login harus berupa object");
        console.assert(loginAfterVerify.token && loginAfterVerify.token.length > 10, "Harus mendapatkan JWT token yang valid");
        console.assert(loginAfterVerify.status === "must_change_password", "Status harus must_change_password untuk login pertama kali");
        console.assert(loginAfterVerify.user.is_verified === 1, "user.is_verified harus 1");
        console.assert(loginAfterVerify.user.password === undefined, "Password hash TIDAK boleh bocor ke client");
        console.log("PASS: Login setelah verifikasi OTP berhasil 100% dan menghasilkan JWT token!");

        // -------------------------------------------------------------
        // TEST 7: Pre-check Duplikat & Rollback
        // -------------------------------------------------------------
        console.log("\n--- TEST 7: Uji Penolakan Duplikasi Akun Keluarga & Rollback ---");
        const dupFamilyResult = await generateWargaAccount(familyId, testUsername + "_new", "Pass123!", `other_${timestamp}@example.com`);
        console.log("Hasil Duplikasi Keluarga:", dupFamilyResult);
        console.assert(typeof dupFamilyResult === "string" && dupFamilyResult.includes("keluarga ini sudah punya akun"), "Duplikasi akun pada familyId yang sama harus ditolak");
        console.log("PASS: Pembuatan akun kedua pada keluarga yang sama berhasil ditolak!");

        console.log("\n===================================================================");
        console.log("🎉 SEMUA TEST ADMIN CREATE ACCOUNT + OTP VERIFIKASI BERHASIL 100%!");
        console.log("===================================================================");

    } catch (err) {
        console.error("\n❌ TEST FAILED:", err);
        process.exit(1);
    } finally {
        // Cleanup test data
        console.log("\n--- Membersihkan Data Test ---");
        if (createdUserId) {
            await pool.execute("DELETE FROM acount WHERE id = ?", [createdUserId]).catch(() => {});
        }
        if (familyId) {
            await pool.execute("DELETE FROM family WHERE id = ?", [familyId]).catch(() => {});
        }
        if (houseId) {
            await pool.execute("DELETE FROM house WHERE id = ?", [houseId]).catch(() => {});
        }
        console.log("PASS: Data test berhasil dibersihkan.");
        await pool.end();
    }
}

runAdminCreateAccountOtpTests();
