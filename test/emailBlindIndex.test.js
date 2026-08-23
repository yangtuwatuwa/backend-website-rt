import pool from "../config/sqlconfig.js";
import { normalizeEmail, computeBlindIndex, encryptEmail, decryptEmail } from "../lib/crypto/email.js";
import { register, loginUser } from "../services/bisnisRegisterAndLogin.js";
import { getAccountByBlindIndex } from "../models/login.js";

async function runTests() {
    console.log("=== RUNNING BLIND INDEX & EMAIL ENCRYPTION TESTS ===");

    try {
        // Test 1: Normalization
        const rawEmail = "   User.Test@Domain.COM   ";
        const normalized = normalizeEmail(rawEmail);
        console.assert(normalized === "user.test@domain.com", "Normalize failed!");
        console.log("✓ Test 1 Passed: Normalization ->", normalized);

        // Test 2: Blind Index determinism & length
        const idx1 = computeBlindIndex("User.Test@Domain.COM");
        const idx2 = computeBlindIndex("user.test@domain.com");
        console.assert(idx1 === idx2, "Blind index non-deterministic!");
        console.assert(idx1.length === 64, "Blind index length invalid!");
        console.log("✓ Test 2 Passed: Deterministic CHAR(64) Blind Index ->", idx1);

        // Test 3: Encryption & Decryption roundtrip & AuthTag validation
        const encryptedBuf = encryptEmail(rawEmail);
        const decryptedStr = decryptEmail(encryptedBuf);
        console.assert(decryptedStr === "user.test@domain.com", "Decryption failed!");
        console.log("✓ Test 3 Passed: AES-256-GCM roundtrip ->", decryptedStr);

        // Test 4: Register account via service
        const testUsername = "unit_test_user_" + Date.now();
        const testEmail = `test_account_${Date.now()}@example.com`;
        const testPass = "PasswordSuperSecret123!";

        const regRes = await register(testUsername, testPass, testEmail, "warga");
        console.log("Registration result:", regRes);
        console.assert(regRes && !String(regRes).startsWith("error"), "Registration failed!");
        console.log("✓ Test 4 Passed: Register account successfully!");

        // Test 5: Register duplicate email (case-insensitive check)
        const dupRes = await register(testUsername + "_dup", testPass, testEmail.toUpperCase(), "warga");
        console.log("Duplicate registration result:", dupRes);
        console.assert(String(dupRes).includes("email sudah terdaftar"), "Duplicate check failed!");
        console.log("✓ Test 5 Passed: Duplicate email blocked!");

        // Test 6: Fast lookup by blind index in DB
        const blindIdx = computeBlindIndex(testEmail);
        const dbAccountRows = await getAccountByBlindIndex(blindIdx);
        console.assert(Array.isArray(dbAccountRows) && dbAccountRows.length === 1, "Blind index DB lookup failed!");
        console.assert(dbAccountRows[0].username === testUsername, "Account username mismatch!");
        console.log("✓ Test 6 Passed: Direct DB query by email_blind_idx!");

        // Test 7: Login by email
        const loginRes = await loginUser(testEmail.toUpperCase(), testPass);
        console.assert(loginRes && loginRes.status === "login berhasil", "Login by email failed!");
        console.log("✓ Test 7 Passed: Login by email via blind index!");

        // Cleanup test user
        await pool.query("DELETE FROM acount WHERE username = ?", [testUsername]);
        console.log("✓ Cleanup completed successfully!");

        console.log("\nALL TESTS PASSED SUCCESSFULLY! 🎉");
    } catch (err) {
        console.error("❌ TEST FAILED:", err);
        process.exit(1);
    } finally {
        pool.end();
    }
}

runTests();
