import pool from "../config/sqlconfig.js";
import { encryptEmails } from "../helpers/ciihper.js";
import { argonhash } from "../helpers/argon2.js";
import { calculateAge } from "../helpers/ageCalculator.js";
import { normalizeEmail, computeBlindIndex, encryptEmail } from "../lib/crypto/email.js";
import crypto from "crypto";

// Fallback password generator if not provided
function generateTempPassword() {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%";
    return Array.from(crypto.randomBytes(12))
        .map(byte => chars[byte % chars.length])
        .join("");
}

export async function registerFamilyService(houseData, familyData, headOfFamilyData, accountData = {}) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // 1. Resolve House (Existing or New)
        let houseId = houseData.houseId || houseData.house_id || houseData.id;
        if (houseId) {
            const [existingHouse] = await conn.execute("SELECT id FROM house WHERE id = ?", [houseId]);
            if (!existingHouse || existingHouse.length === 0) {
                throw new Error(`Data rumah dengan ID ${houseId} tidak ditemukan`);
            }
        } else {
            const { blok, nomor, alamat, status: houseStatus = "pribadi" } = houseData;
            if (!blok || !nomor || !alamat) {
                throw new Error("Data rumah tidak lengkap (blok, nomor, alamat wajib diisi)");
            }
            const encryptedBlok = encryptEmails(String(blok));
            const encryptedNomor = encryptEmails(String(nomor));
            const encryptedAlamat = encryptEmails(String(alamat));

            const [houseResult] = await conn.execute(
                "INSERT INTO house (id, blok, nomor, alamat, status) VALUES (NULL, ?, ?, ?, ?)",
                [encryptedBlok, encryptedNomor, encryptedAlamat, houseStatus]
            );
            houseId = houseResult.insertId;
        }

        // 2. Insert Family (KK) with temporary kepala_keluarga_id = NULL
        const { noKK, no_kk, nokk } = familyData;
        const rawNoKK = noKK || no_kk || nokk;
        if (!rawNoKK) {
            throw new Error("Nomor KK wajib diisi");
        }
        const encryptedKK = encryptEmails(String(rawNoKK));
        const [familyResult] = await conn.execute(
            "INSERT INTO family (id, no_kk, house_id, kepala_keluarga_id) VALUES (NULL, ?, ?, NULL)",
            [encryptedKK, houseId]
        );
        const familyId = familyResult.insertId;

        // 3. Insert Warga (Kepala Keluarga)
        const { nik, nama, jenisKelamin, tglLahir, statusHidup = "Hidup", noHp, umur } = headOfFamilyData;
        if (!nik || !nama || !jenisKelamin || !tglLahir || !noHp) {
            throw new Error("Data kepala keluarga tidak lengkap (NIK, nama, jenis kelamin, tgl lahir, no HP wajib diisi)");
        }
        const encryptedNIK = encryptEmails(String(nik));
        const encryptedTglLahir = encryptEmails(String(tglLahir));
        const encryptedNoHp = encryptEmails(String(noHp));
        const finalUmur = calculateAge(tglLahir, umur);

        const [wargaResult] = await conn.execute(
            "INSERT INTO warga (id, nik, nama, jenis_kelamin, tgl_lahir, status_hidup, no_hp, umur, family_id, house_id, status_data) VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'diterima')",
            [encryptedNIK, nama, jenisKelamin, encryptedTglLahir, statusHidup, encryptedNoHp, finalUmur, familyId, houseId]
        );
        const wargaId = wargaResult.insertId;

        // 4. Update family's kepala_keluarga_id with actual wargaId
        await conn.execute(
            "UPDATE family SET kepala_keluarga_id = ? WHERE id = ?",
            [wargaId, familyId]
        );

        // 5. Create Warga Login Account
        const username = (accountData.username && String(accountData.username).trim())
            ? String(accountData.username).trim()
            : `keluarga_${familyId}`;

        if (username.length < 3) {
            throw new Error("Username minimal 3 karakter");
        }

        // Check if username already exists
        const [existingUser] = await conn.execute("SELECT id FROM acount WHERE username = ?", [username]);
        if (existingUser && existingUser.length > 0) {
            throw new Error("Username sudah digunakan oleh akun lain");
        }

        const rawPassword = (accountData.password && String(accountData.password).trim())
            ? String(accountData.password).trim()
            : generateTempPassword();

        if (rawPassword.length < 6) {
            throw new Error("Password minimal 6 karakter");
        }

        const rawEmail = accountData.email || headOfFamilyData.email || `${username}@warga.local`;
        const normalized = normalizeEmail(rawEmail);
        const blindIdx = computeBlindIndex(normalized);
        const encryptedEmail = encryptEmail(normalized);

        // Check if email already exists
        const [existingEmail] = await conn.execute("SELECT id FROM acount WHERE email_blind_idx = ?", [blindIdx]);
        if (existingEmail && existingEmail.length > 0) {
            throw new Error("Email sudah terdaftar pada akun lain");
        }

        const passwordHash = await argonhash(rawPassword);

        await conn.execute(
            "INSERT INTO acount (id, username, password, email_encrypted, email_blind_idx, role, family_id, must_change_password) VALUES (NULL, ?, ?, ?, ?, 'warga', ?, 1)",
            [username, passwordHash, encryptedEmail, blindIdx, familyId]
        );

        await conn.commit();

        return {
            houseId,
            familyId,
            kepalaKeluargaId: wargaId,
            account: {
                username,
                role: "warga",
                email: rawEmail
            }
        };

    } catch (err) {
        await conn.rollback();
        console.log("error registerFamilyService:", err.message || err);
        return "error karena: " + (err.message || err);
    } finally {
        conn.release();
    }
}
