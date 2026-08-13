import { createPengaduan, listPengaduanWarga, listAllPengaduan, changePengaduanStatus, removePengaduan } from "../services/pengaduan.js"
import { responseSucces } from "../utils/response.js"
import { emitSyncEvent } from "../utils/socket.js"

export async function addPengaduan(req, res) {
    const { isi, jenis_pengaduan } = req.body
    const userId = req.user.id
    console.log(`[Request Add Pengaduan] userId: ${userId}, jenis: ${jenis_pengaduan}, isi: ${isi}`)
    try {
        const hasilnya = await createPengaduan(userId, isi, jenis_pengaduan)
        console.log(`[Response Add Pengaduan] hasil:`, hasilnya)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        emitSyncEvent("pengaduan")
        return responseSucces(200, hasilnya, "pengaduan berhasil terkirim", res)
    } catch (err) {
        console.log(`[Error Add Pengaduan]:`, err)
        return res.status(500).json("salah dibagian controller addPengaduan: " + err)
    }
}

export async function checkStatusPengaduan(req, res) {
    const userId = req.user.id
    console.log(`[Request Check Status Pengaduan] userId: ${userId}`)
    try {
        const hasilnya = await listPengaduanWarga(userId)
        console.log(`[Response Check Status Pengaduan] count: ${Array.isArray(hasilnya) ? hasilnya.length : 0}`)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        return res.json(hasilnya)
    } catch (err) {
        console.log(`[Error Check Status Pengaduan]:`, err)
        return res.status(500).json("salah dibagian controller checkStatusPengaduan: " + err)
    }
}

export async function reviewPengaduan(req, res) {
    console.log(`[Request Review Pengaduan]`)
    try {
        const hasilnya = await listAllPengaduan()
        console.log(`[Response Review Pengaduan] count: ${Array.isArray(hasilnya) ? hasilnya.length : 0}`)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        return res.json(hasilnya)
    } catch (err) {
        console.log(`[Error Review Pengaduan]:`, err)
        return res.status(500).json("salah dibagian controller reviewPengaduan: " + err)
    }
}

export async function approvePengaduan(req, res) {
    const { id } = req.params
    const { status, catatan, catatan_tindak_lanjut, tindak_lanjut } = req.body
    const note = catatan || catatan_tindak_lanjut || tindak_lanjut || null
    console.log(`[Request Approve Pengaduan] id: ${id}, status: ${status}, catatan: ${note}`)
    try {
        const hasilnya = await changePengaduanStatus(id, status, note)
        console.log(`[Response Approve Pengaduan] hasil:`, hasilnya)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        emitSyncEvent("pengaduan")
        return responseSucces(200, hasilnya, "status pengaduan berhasil diupdate", res)
    } catch (err) {
        console.log(`[Error Approve Pengaduan]:`, err)
        return res.status(500).json("salah dibagian controller approvePengaduan: " + err)
    }
}

export async function removePengaduanController(req, res) {
    const { id } = req.params
    console.log(`[Request Remove Pengaduan] id: ${id}`)
    try {
        const hasilnya = await removePengaduan(id)
        console.log(`[Response Remove Pengaduan] hasil:`, hasilnya)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        emitSyncEvent("pengaduan")
        return responseSucces(200, hasilnya, "laporan pengaduan berhasil dihapus", res)
    } catch (err) {
        console.log(`[Error Remove Pengaduan]:`, err)
        return res.status(500).json("salah dibagian controller removePengaduanController: " + err)
    }
}

