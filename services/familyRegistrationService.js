import pool from "../config/sqlconfig.js";
import { encryptEmails } from "../helpers/ciihper.js";
import { argonhash } from "../helpers/argon2.js";

// Password generator
function generateTempPassword() {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%";
    let password = "";
    for (let i = 0; i < 8; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

export async function registerFamilyService(houseData, familyData, headOfFamilyData) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // 1. Insert House
        const { blok, nomor, alamat, status: houseStatus } = houseData;
        if (!blok || !nomor || !alamat || !houseStatus) {
            throw new Error("Data rumah tidak lengkap (blok, nomor, alamat, status wajib diisi)");
        }

        const [houseResult] = await conn.execute(
            "INSERT INTO house (id, blok, nomor, alamat, status) VALUES (NULL, ?, ?, ?, ?)",
            [blok, nomor, alamat, houseStatus]
        );
        const houseId = houseResult.insertId;

        // 2. Insert Family (KK) with temporary kepala_keluarga_id = 1
        const { noKK } = familyData;
        if (!noKK) {
            throw new Error("Nomor KK wajib diisi");
        }
        const encryptedKK = encryptEmails(noKK);
        const [familyResult] = await conn.execute(
            "INSERT INTO family (id, no_kk, house_id, kepala_keluarga_id) VALUES (NULL, ?, ?, 1)",
            [encryptedKK, houseId]
        );
        const familyId = familyResult.insertId;

        // 3. Insert Warga (Kepala Keluarga)
        const { nik, nama, jenisKelamin, tglLahir, statusHidup, noHp, umur } = headOfFamilyData;
        if (!nik || !nama || !jenisKelamin || !tglLahir || !statusHidup || !noHp || !umur) {
            throw new Error("Data kepala keluarga tidak lengkap");
        }
        const encryptedNIK = encryptEmails(nik);
        const [wargaResult] = await conn.execute(
            "INSERT INTO warga (id, nik, nama, jenis_kelamin, tgl_lahir, status_hidup, no_hp, umur, family_id, house_id, status_data) VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'diterima')",
            [encryptedNIK, nama, jenisKelamin, tglLahir, statusHidup, noHp, umur, familyId, houseId]
        );
        const wargaId = wargaResult.insertId;

        // 4. Update family's kepala_keluarga_id with actual wargaId
        await conn.execute(
            "UPDATE family SET kepala_keluarga_id = ? WHERE id = ?",
            [wargaId, familyId]
        );

        // 5. Generate and Insert Warga Login Account
        const username = `keluarga_${familyId}`;
        const tempPassword = generateTempPassword();
        const passwordHash = await argonhash(tempPassword);

        await conn.execute(
            "INSERT INTO acount (id, username, password, email, role, family_id, must_change_password) VALUES (NULL, ?, ?, NULL, 'warga', ?, 1)",
            [username, passwordHash, familyId]
        );

        await conn.commit();

        return {
            houseId,
            familyId,
            kepalaKeluargaId: wargaId,
            account: {
                username,
                temporaryPassword: tempPassword
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
