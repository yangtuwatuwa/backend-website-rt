import pool from "../config/sqlconfig.js";
import { encryptEmails, decryptEmails } from "../helpers/ciihper.js";
import { calculateAge } from "../helpers/ageCalculator.js";

export async function registerResidentOnlyService(houseData, familyData, wargaData) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // 1. Resolve House (Existing House ID atau Create New House)
        let houseId = houseData.houseId || houseData.house_id || houseData.id;
        if (houseId) {
            const [existingHouse] = await conn.execute("SELECT id FROM house WHERE id = ?", [houseId]);
            if (!existingHouse || existingHouse.length === 0) {
                throw new Error(`Data rumah dengan ID ${houseId} tidak ditemukan`);
            }
        } else {
            const { blok, nomor, alamat, status: houseStatus = "pribadi" } = houseData;
            if (!blok || !nomor || !alamat) {
                throw new Error("Data rumah tidak lengkap (blok, nomor, dan alamat wajib diisi)");
            }
            const encryptedBlok = encryptEmails(String(blok).trim());
            const encryptedNomor = encryptEmails(String(nomor).trim());
            const encryptedAlamat = encryptEmails(String(alamat).trim());

            const [houseResult] = await conn.execute(
                "INSERT INTO house (id, blok, nomor, alamat, status) VALUES (NULL, ?, ?, ?, ?)",
                [encryptedBlok, encryptedNomor, encryptedAlamat, houseStatus]
            );
            houseId = houseResult.insertId;
        }

        // 2. Validate & Insert Family (KK) with temporary kepala_keluarga_id = NULL
        const { noKK, no_kk, nokk } = familyData;
        const rawNoKK = noKK || no_kk || nokk;
        if (!rawNoKK) {
            throw new Error("Nomor KK (Kartu Keluarga) wajib diisi");
        }
        const cleanedNoKK = String(rawNoKK).trim();

        // Cek duplikasi No KK di database
        const [allFamilies] = await conn.execute("SELECT id, no_kk FROM family");
        for (const fam of allFamilies) {
            try {
                if (decryptEmails(fam.no_kk) === cleanedNoKK) {
                    throw new Error(`Nomor Kartu Keluarga (${cleanedNoKK}) sudah terdaftar dalam sistem`);
                }
            } catch (decErr) {
                if (decErr.message.includes("sudah terdaftar")) throw decErr;
            }
        }

        const encryptedKK = encryptEmails(cleanedNoKK);
        const [familyResult] = await conn.execute(
            "INSERT INTO family (id, no_kk, house_id, kepala_keluarga_id) VALUES (NULL, ?, ?, NULL)",
            [encryptedKK, houseId]
        );
        const familyId = familyResult.insertId;

        // 3. Validate & Insert Warga (Otomatis Kepala Keluarga)
        const { nik, nama, jenisKelamin, jenis_kelamin, tglLahir, tgl_lahir, statusHidup, status_hidup, noHp, no_hp, umur } = wargaData;
        const rawNik = nik;
        const rawNama = nama;
        const rawJenisKelamin = jenisKelamin || jenis_kelamin;
        const rawTglLahir = tglLahir || tgl_lahir;
        const rawStatusHidup = statusHidup || status_hidup || "Hidup";
        const rawNoHp = noHp || no_hp;

        if (!rawNik || !rawNama || !rawJenisKelamin || !rawTglLahir || !rawNoHp) {
            throw new Error("Data warga tidak lengkap (NIK, nama, jenis kelamin, tanggal lahir, dan nomor HP wajib diisi)");
        }

        const cleanedNik = String(rawNik).trim();

        // Cek duplikasi NIK di database
        const [allWargas] = await conn.execute("SELECT id, nik FROM warga");
        for (const w of allWargas) {
            try {
                if (decryptEmails(w.nik) === cleanedNik) {
                    throw new Error(`NIK (${cleanedNik}) sudah terdaftar dalam sistem`);
                }
            } catch (decErr) {
                if (decErr.message.includes("sudah terdaftar")) throw decErr;
            }
        }

        const encryptedNIK = encryptEmails(cleanedNik);
        const encryptedTglLahir = encryptEmails(String(rawTglLahir).trim());
        const encryptedNoHp = encryptEmails(String(rawNoHp).trim());
        const finalUmur = calculateAge(rawTglLahir, umur);

        const [wargaResult] = await conn.execute(
            "INSERT INTO warga (id, nik, nama, jenis_kelamin, tgl_lahir, status_hidup, no_hp, umur, family_id, house_id, status_data) VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'diterima')",
            [encryptedNIK, rawNama.trim(), rawJenisKelamin, encryptedTglLahir, rawStatusHidup, encryptedNoHp, finalUmur, familyId, houseId]
        );
        const wargaId = wargaResult.insertId;

        // 4. Update family's kepala_keluarga_id dengan wargaId
        await conn.execute(
            "UPDATE family SET kepala_keluarga_id = ? WHERE id = ?",
            [wargaId, familyId]
        );

        await conn.commit();

        return {
            houseId,
            familyId,
            wargaId
        };

    } catch (err) {
        await conn.rollback();
        console.log("[Error registerResidentOnlyService]:", err.message || err);
        throw err;
    } finally {
        conn.release();
    }
}
