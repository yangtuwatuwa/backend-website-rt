import { getProfilSayaByAccountId } from "../models/profilSaya.js";
import { decryptEmails } from "../helpers/ciihper.js";
import { decryptEmail } from "../lib/crypto/email.js";
import { maskEmail, maskNik } from "../utils/masking.js";
import pool from "../config/sqlconfig.js";

function decryptLegacyField(value) {
    if (!value) return null;
    const decrypted = decryptEmails(value);
    return decrypted || null;
}

function decryptAccountEmail(value) {
    if (!value) return null;
    try {
        return decryptEmail(value) || null;
    } catch {
        return null;
    }
}

export async function getProfilSayaService(userId, executor = pool) {
    if (!userId) return "error: Identitas user login tidak ditemukan";

    try {
        const row = await getProfilSayaByAccountId(userId, executor);
        if (!row) return "error: Akun warga tidak ditemukan";
        if (!row.family_id) return "error: Akun warga belum terikat dengan keluarga";
        if (!row.warga_id) return "error: Kepala keluarga aktif tidak ditemukan";

        const nik = decryptLegacyField(row.nik);
        const email = decryptAccountEmail(row.email_encrypted);

        // Whitelist eksplisit: ciphertext, ID internal, dan field lain seperti
        // pekerjaan tidak dapat ikut terkirim akibat object spread.
        return {
            username: row.username,
            nama: row.nama,
            nik: maskNik(nik),
            jenis_kelamin: row.jenis_kelamin,
            tgl_lahir: decryptLegacyField(row.tgl_lahir),
            rt: null,
            rw: null,
            alamat: decryptLegacyField(row.house_alamat),
            blok: decryptLegacyField(row.house_blok),
            nomor_rumah: decryptLegacyField(row.house_nomor),
            status_rumah: row.house_status || null,
            no_hp: decryptLegacyField(row.no_hp),
            email: maskEmail(email)
        };
    } catch (err) {
        console.log("error getProfilSayaService:", err);
        return "error karena: " + (err.message || err);
    }
}
