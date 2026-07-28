import { 
    createSuratMasuk, 
    getSuratMasukList, 
    createSuratKeluar, 
    getSuratKeluarList 
} from "../models/surat.js"
import { responseSucces } from "../utils/response.js"
import { emitSyncEvent } from "../utils/socket.js"

// === SURAT MASUK ===

export async function createSuratMasukController(req, res) {
    const { instansi_pengirim, perihal } = req.body
    console.log(`[Request Create Surat Masuk] instansi_pengirim: ${instansi_pengirim}, perihal: ${perihal}`)
    
    if (!instansi_pengirim || instansi_pengirim.trim() === "") {
        return res.status(400).json({ pesan: "Pengirim / Instansi Asal wajib diisi masbro" })
    }
    if (instansi_pengirim.length > 200) {
        return res.status(400).json({ pesan: "Pengirim / Instansi Asal maksimal 200 karakter masbro" })
    }
    if (!perihal || perihal.trim() === "") {
        return res.status(400).json({ pesan: "Hal / Perihal Surat wajib diisi masbro" })
    }
    if (perihal.length > 200) {
        return res.status(400).json({ pesan: "Hal / Perihal Surat maksimal 200 karakter masbro" })
    }

    try {
        const hasilnya = await createSuratMasuk(instansi_pengirim.trim(), perihal.trim())
        console.log("[Response Create Surat Masuk] hasil:", hasilnya)
        
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        
        emitSyncEvent("surat_masuk")
        return responseSucces(201, hasilnya, "Registrasi surat masuk berhasil dicatat masbro", res)
    } catch (err) {
        console.log("[Error Create Surat Masuk]:", err)
        return res.status(500).json({ pesan: "Error di controller createSuratMasukController: " + err })
    }
}

export async function getSuratMasukController(req, res) {
    console.log("[Request Get Surat Masuk]")
    try {
        const hasilnya = await getSuratMasukList()
        console.log(`[Response Get Surat Masuk] count: ${Array.isArray(hasilnya) ? hasilnya.length : 0}`)
        
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        
        return responseSucces(200, hasilnya, "Daftar surat masuk berhasil diambil masbro", res)
    } catch (err) {
        console.log("[Error Get Surat Masuk]:", err)
        return res.status(500).json({ pesan: "Error di controller getSuratMasukController: " + err })
    }
}

// === SURAT KELUAR ===

export async function createSuratKeluarController(req, res) {
    const { penerima, perihal } = req.body
    console.log(`[Request Create Surat Keluar] penerima: ${penerima}, perihal: ${perihal}`)
    
    if (!penerima || penerima.trim() === "") {
        return res.status(400).json({ pesan: "Penerima / Warga Tujuan wajib diisi masbro" })
    }
    if (penerima.length > 200) {
        return res.status(400).json({ pesan: "Penerima / Warga Tujuan maksimal 200 karakter masbro" })
    }
    if (!perihal || perihal.trim() === "") {
        return res.status(400).json({ pesan: "Hal / Perihal Surat wajib diisi masbro" })
    }
    if (perihal.length > 200) {
        return res.status(400).json({ pesan: "Hal / Perihal Surat maksimal 200 karakter masbro" })
    }

    try {
        const hasilnya = await createSuratKeluar(penerima.trim(), perihal.trim())
        console.log("[Response Create Surat Keluar] hasil:", hasilnya)
        
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        
        emitSyncEvent("surat_keluar")
        return responseSucces(201, hasilnya, "Catat surat keluar berhasil dicatat masbro", res)
    } catch (err) {
        console.log("[Error Create Surat Keluar]:", err)
        return res.status(500).json({ pesan: "Error di controller createSuratKeluarController: " + err })
    }
}

export async function getSuratKeluarController(req, res) {
    console.log("[Request Get Surat Keluar]")
    try {
        const hasilnya = await getSuratKeluarList()
        console.log(`[Response Get Surat Keluar] count: ${Array.isArray(hasilnya) ? hasilnya.length : 0}`)
        
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        
        return responseSucces(200, hasilnya, "Daftar surat keluar berhasil diambil masbro", res)
    } catch (err) {
        console.log("[Error Get Surat Keluar]:", err)
        return res.status(500).json({ pesan: "Error di controller getSuratKeluarController: " + err })
    }
}
