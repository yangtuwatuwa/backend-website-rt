import { 
    createTemplateSurat, 
    getTemplateSuratList, 
    getTemplateSuratById, 
    updateTemplateSurat, 
    deleteTemplateSurat 
} from "../models/templateSurat.js"
import { responseSucces } from "../utils/response.js"
import { emitSyncEvent } from "../utils/socket.js"
import fs from "fs"
import path from "path"

// === UPLOAD TEMPLATE SURAT (Sekretaris / RT) ===

export async function uploadTemplateSuratController(req, res) {
    const { judul, deskripsi, kategori } = req.body
    const file = req.file
    console.log(`[Request Upload Template Surat] judul: ${judul}, kategori: ${kategori}, file: ${file?.filename}`)

    if (!file) {
        return res.status(400).json({ pesan: "Pilih file template yang mau diupload dulu, cuy!" })
    }

    if (!judul || judul.trim() === "") {
        if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path)
        return res.status(400).json({ pesan: "Judul template surat wajib diisi masbro!" })
    }

    if (judul.length > 200) {
        if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path)
        return res.status(400).json({ pesan: "Judul template surat maksimal 200 karakter masbro!" })
    }

    try {
        const hasilnya = await createTemplateSurat(
            judul.trim(), 
            deskripsi ? deskripsi.trim() : "", 
            kategori ? kategori.trim() : "", 
            file.filename, 
            file.originalname
        )
        console.log("[Response Upload Template Surat] hasil:", hasilnya)

        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path)
            return res.status(400).json({ pesan: hasilnya })
        }

        emitSyncEvent("template_surat")
        return responseSucces(201, { id: hasilnya.insertId, file_name: file.filename }, "Upload template surat berhasil masbro!", res)
    } catch (err) {
        console.log("[Error Upload Template Surat]:", err)
        if (file && file.path && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path)
        }
        return res.status(500).json({ pesan: "Error di controller uploadTemplateSuratController: " + err })
    }
}

// === GET TEMPLATE SURAT LIST (Warga & Admin) ===

export async function getTemplateSuratListController(req, res) {
    const { search } = req.query
    console.log(`[Request Get Template Surat List] search: ${search || ""}`)

    try {
        const hasilnya = await getTemplateSuratList(search)
        console.log(`[Response Get Template Surat List] count: ${Array.isArray(hasilnya) ? hasilnya.length : 0}`)

        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }

        return responseSucces(200, hasilnya, "Daftar template surat berhasil diambil masbro", res)
    } catch (err) {
        console.log("[Error Get Template Surat List]:", err)
        return res.status(500).json({ pesan: "Error di controller getTemplateSuratListController: " + err })
    }
}

// === DOWNLOAD TEMPLATE SURAT (Warga & Admin) ===

export async function downloadTemplateSuratController(req, res) {
    const { id } = req.params
    console.log(`[Request Download Template Surat] id: ${id}`)

    try {
        const template = await getTemplateSuratById(id)
        if (!template || (typeof template === "string" && template.startsWith("error"))) {
            return res.status(404).json({ pesan: "Template surat tidak ditemukan masbro!" })
        }

        const filePath = path.resolve("./uploads/templates", template.file_path)
        if (!fs.existsSync(filePath)) {
            console.log(`[Response Download Template Surat] Gagal: File tidak ditemukan di ${filePath}`)
            return res.status(404).json({ pesan: "File fisik template surat tidak ditemukan di server masbro!" })
        }

        console.log(`[Response Download Template Surat] mengirim file ${template.original_name || template.file_path}`)
        return res.download(filePath, template.original_name || template.file_path)
    } catch (err) {
        console.log("[Error Download Template Surat]:", err)
        return res.status(500).json({ pesan: "Error di controller downloadTemplateSuratController: " + err })
    }
}

// === UPDATE TEMPLATE SURAT (Sekretaris / RT) ===

export async function updateTemplateSuratController(req, res) {
    const { id } = req.params
    const { judul, deskripsi, kategori } = req.body
    const file = req.file
    console.log(`[Request Update Template Surat] id: ${id}, body:`, req.body, `file: ${file?.filename}`)

    try {
        const existingTemplate = await getTemplateSuratById(id)
        if (!existingTemplate || (typeof existingTemplate === "string" && existingTemplate.startsWith("error"))) {
            if (file && file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path)
            return res.status(404).json({ pesan: "Template surat tidak ditemukan masbro!" })
        }

        const dataToUpdate = {}
        if (judul && judul.trim() !== "") dataToUpdate.judul = judul.trim()
        if (deskripsi !== undefined) dataToUpdate.deskripsi = deskripsi.trim()
        if (kategori !== undefined) dataToUpdate.kategori = kategori.trim()

        if (file) {
            // Hapus file lama jika ada
            const oldFilePath = path.resolve("./uploads/templates", existingTemplate.file_path)
            if (fs.existsSync(oldFilePath)) {
                fs.unlinkSync(oldFilePath)
            }
            dataToUpdate.file_path = file.filename
            dataToUpdate.original_name = file.originalname
        }

        const hasilnya = await updateTemplateSurat(id, dataToUpdate)
        console.log("[Response Update Template Surat] hasil:", hasilnya)

        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            if (file && file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path)
            return res.status(400).json({ pesan: hasilnya })
        }

        emitSyncEvent("template_surat")
        return responseSucces(200, hasilnya, "Template surat berhasil diperbarui masbro!", res)
    } catch (err) {
        console.log("[Error Update Template Surat]:", err)
        if (file && file.path && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path)
        }
        return res.status(500).json({ pesan: "Error di controller updateTemplateSuratController: " + err })
    }
}

// === DELETE TEMPLATE SURAT (Sekretaris / RT) ===

export async function deleteTemplateSuratController(req, res) {
    const { id } = req.params
    console.log(`[Request Delete Template Surat] id: ${id}`)

    try {
        const existingTemplate = await getTemplateSuratById(id)
        if (!existingTemplate || (typeof existingTemplate === "string" && existingTemplate.startsWith("error"))) {
            return res.status(404).json({ pesan: "Template surat tidak ditemukan masbro!" })
        }

        const hasilnya = await deleteTemplateSurat(id)
        console.log("[Response Delete Template Surat] hasil:", hasilnya)

        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }

        // Hapus file fisik dari disk
        const filePath = path.resolve("./uploads/templates", existingTemplate.file_path)
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath)
        }

        emitSyncEvent("template_surat")
        return responseSucces(200, hasilnya, "Template surat berhasil dihapus masbro!", res)
    } catch (err) {
        console.log("[Error Delete Template Surat]:", err)
        return res.status(500).json({ pesan: "Error di controller deleteTemplateSuratController: " + err })
    }
}
