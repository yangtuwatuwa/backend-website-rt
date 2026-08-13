import { getAccountById } from "../models/login.js"
import { getWargaById } from "../models/inputwarganya.js"
import { getFamilyById } from "../models/resident.js"
import { getHouseById } from "../models/houseWarga.js"
import { createDocument, getDocumentById, deleteDocument } from "../models/document.js"
import { responseSucces } from "../utils/response.js"
import fs from "fs"
import path from "path"

export async function uploadSensitifDataController(req, res) {
    const { id } = req.params
    const { type } = req.body
    const userId = req.user.id
    const file = req.file
    console.log(`[Request Upload Sensitif Data] targetId: ${id}, type: ${type}, file: ${file?.filename}`)

    if (!file) {
        console.log(`[Response Upload Sensitif Data] Gagal: File upload kosong`)
        return res.status(400).json({ pesan: "Pilih file yang mau diupload dulu, cuy!" })
    }

    const allowedTypes = ["kk", "ktp", "akta", "kia", "foto"]
    if (!type || !allowedTypes.includes(type)) {
        if (file.path && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path)
        }
        console.log(`[Response Upload Sensitif Data] Gagal: Tipe ${type} tidak valid`)
        return res.status(400).json({ pesan: "Tipe dokumen tidak valid! Pilih antara kk, ktp, akta, kia, atau foto." })
    }

    try {
        const dataUser = await getAccountById(userId)
        if (!dataUser || dataUser === "error" || dataUser.length === 0) {
            if (fs.existsSync(file.path)) fs.unlinkSync(file.path)
            console.log(`[Response Upload Sensitif Data] Gagal: Akun tidak ditemukan`)
            return res.status(404).json({ pesan: "Akun tidak ditemukan mas" })
        }

        const warga = await getWargaById(id)
        if (!warga || (typeof warga === "string" && warga.startsWith("error"))) {
            if (fs.existsSync(file.path)) fs.unlinkSync(file.path)
            console.log(`[Response Upload Sensitif Data] Gagal: Data warga tidak ditemukan`)
            return res.status(404).json({ pesan: "Data warga tidak ditemukan" })
        }

        if (req.user.role === "warga") {
            const userFamilyId = dataUser[0].family_id
            if (String(userFamilyId) !== String(warga.family_id)) {
                if (fs.existsSync(file.path)) fs.unlinkSync(file.path)
                console.log(`[Response Upload Sensitif Data] Gagal: Akses ditolak karena berbeda KK`)
                return res.status(403).json({ pesan: "Akses ditolak, ini bukan data keluarga lu cuy!" })
            }

            // Ambil data KK dan Rumah untuk memvalidasi status kepemilikan
            const family = await getFamilyById(warga.family_id)
            if (!family || (typeof family === "string" && family.startsWith("error"))) {
                if (fs.existsSync(file.path)) fs.unlinkSync(file.path)
                console.log(`[Response Upload Sensitif Data] Gagal: Data KK keluarga tidak ditemukan`)
                return res.status(404).json({ pesan: "Data KK keluarga tidak ditemukan masbro" })
            }

            const house = await getHouseById(family.house_id)
            if (!house || (typeof house === "string" && house.startsWith("error"))) {
                if (fs.existsSync(file.path)) fs.unlinkSync(file.path)
                console.log(`[Response Upload Sensitif Data] Gagal: Data rumah tidak ditemukan`)
                return res.status(404).json({ pesan: "Data rumah keluarga tidak ditemukan masbro" })
            }

        }

        const results = await createDocument(warga.family_id, id, type, file.filename)
        console.log(`[Response Upload Sensitif Data] hasil:`, results)
        if (typeof results === "string" && results.startsWith("error")) {
            if (fs.existsSync(file.path)) fs.unlinkSync(file.path)
            return res.status(400).json({ pesan: results })
        }

        return responseSucces(200, { document_id: results.insertId, file_path: file.filename }, "Upload file sensitif berhasil masbro!", res)
    } catch (err) {
        console.log(`[Error Upload Sensitif Data]:`, err)
        if (file && file.path && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path)
        }
        return res.status(500).json({ pesan: "error mas di controller uploadSensitifDataController: " + err })
    }
}

export async function downloadSensitifFileController(req, res) {
    const targetDocId = req.params.document_id || req.params.id
    const userId = req.user.id
    console.log(`[Request Download Sensitif File] document_id: ${targetDocId}, byUserId: ${userId}`)

    try {
        const dataUser = await getAccountById(userId)
        if (!dataUser || dataUser === "error" || dataUser.length === 0) {
            console.log(`[Response Download Sensitif File] Gagal: Akun tidak ditemukan`)
            return res.status(404).json({ pesan: "Akun tidak ditemukan mas" })
        }

        const document = await getDocumentById(targetDocId)
        if (!document || (typeof document === "string" && document.startsWith("error"))) {
            console.log(`[Response Download Sensitif File] Gagal: Dokumen tidak ditemukan`)
            return res.status(404).json({ pesan: "Dokumen tidak ditemukan, cuy!" })
        }

        if (req.user.role === "warga") {
            const userFamilyId = dataUser[0].family_id
            if (String(userFamilyId) !== String(document.family_id)) {
                console.log(`[Response Download Sensitif File] Gagal: Akses ditolak karena berbeda KK`)
                return res.status(403).json({ pesan: "Akses ditolak, ini bukan data keluarga lu cuy!" })
            }
        }

        const filePath = path.resolve("./secure_uploads", document.file_path)
        if (!fs.existsSync(filePath)) {
            console.log(`[Response Download Sensitif File] Gagal: File fisik tidak ditemukan di ${filePath}`)
            return res.status(404).json({ pesan: "File fisik dokumen tidak ditemukan di server, masbro" })
        }

        console.log(`[Response Download Sensitif File] sukses mengirim file`)
        return res.sendFile(filePath)
    } catch (err) {
        console.log(`[Error Download Sensitif File]:`, err)
        return res.status(500).json({ pesan: "error mas di controller downloadSensitifFileController: " + err })
    }
}

export async function deleteSensitifDataController(req, res) {
    const targetDocId = req.params.id || req.params.document_id
    const userId = req.user.id
    console.log(`[Request Delete Sensitif Data] document_id: ${targetDocId}, byUserId: ${userId}`)

    try {
        const dataUser = await getAccountById(userId)
        if (!dataUser || dataUser === "error" || dataUser.length === 0) {
            return res.status(404).json({ pesan: "Akun tidak ditemukan mas" })
        }

        const document = await getDocumentById(targetDocId)
        if (!document || (typeof document === "string" && document.startsWith("error"))) {
            return res.status(404).json({ pesan: "Dokumen tidak ditemukan, cuy!" })
        }

        if (req.user.role === "warga") {
            const userFamilyId = dataUser[0].family_id
            if (String(userFamilyId) !== String(document.family_id)) {
                return res.status(403).json({ pesan: "Akses ditolak, ini bukan dokumen keluarga lu cuy!" })
            }
        }

        if (document.file_path) {
            const filePath = path.resolve("./secure_uploads", document.file_path)
            if (fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath)
                } catch (unlinkErr) {
                    console.log("[Warning] Gagal me-unlink berkas fisik:", unlinkErr)
                }
            }
        }

        const deleteResult = await deleteDocument(targetDocId)
        if (typeof deleteResult === "string" && deleteResult.startsWith("error")) {
            return res.status(400).json({ pesan: deleteResult })
        }

        return responseSucces(200, deleteResult, "Dokumen kependudukan terunggah berhasil dihapus!", res)
    } catch (err) {
        console.log(`[Error Delete Sensitif Data]:`, err)
        return res.status(500).json({ pesan: "error mas di controller deleteSensitifDataController: " + err })
    }
}

export async function getWargaKtpController(req, res) {
    const wargaId = req.params.id || req.params.warga_id;
    console.log(`[Request Get Warga KTP File] wargaId: ${wargaId}`);

    try {
        const [docs] = await db.execute(
            "SELECT * FROM document WHERE (resident_id = ? OR family_id = (SELECT family_id FROM warga WHERE id = ?)) AND (type = 'ktp' OR type LIKE '%ktp%') ORDER BY id DESC LIMIT 1",
            [wargaId, wargaId]
        );

        if (!docs || docs.length === 0) {
            return res.status(404).json({ pesan: "Foto KTP belum diupload untuk warga ini masbro" });
        }

        const document = docs[0];
        const filePath = path.resolve("./secure_uploads", document.file_path);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ pesan: "File fisik KTP tidak ditemukan di server" });
        }

        return res.sendFile(filePath);
    } catch (err) {
        console.log(`[Error Get Warga KTP File]:`, err);
        return res.status(500).json({ pesan: "error di controller getWargaKtpController: " + err });
    }
}


