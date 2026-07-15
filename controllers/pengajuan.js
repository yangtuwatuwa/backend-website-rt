import { createPengajuan, listPengajuanWarga, listAllPengajuan, changePengajuanStatus } from "../services/pengajuan.js"
import { responseSucces } from "../utils/response.js"

export async function addPengajuan(req, res) {
    const { keperluan, jenis } = req.body
    const userId = req.user.id
    console.log(`[Request Add Pengajuan] userId: ${userId}, jenis: ${jenis}, keperluan: ${keperluan}`)
    try {
        const hasilnya = await createPengajuan(userId, keperluan, jenis)
        console.log(`[Response Add Pengajuan] hasil:`, hasilnya)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        return responseSucces(200, hasilnya, "pengajuan berhasil dikirim", res)
    } catch (err) {
        console.log(`[Error Add Pengajuan]:`, err)
        return res.status(500).json("salah dibagian controller addPengajuan: " + err)
    }
}

export async function checkStatusPengajuan(req, res) {
    const userId = req.user.id
    console.log(`[Request Check Status Pengajuan] userId: ${userId}`)
    try {
        const hasilnya = await listPengajuanWarga(userId)
        console.log(`[Response Check Status Pengajuan] count: ${Array.isArray(hasilnya) ? hasilnya.length : 0}`)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        return res.json(hasilnya)
    } catch (err) {
        console.log(`[Error Check Status Pengajuan]:`, err)
        return res.status(500).json("salah dibagian controller checkStatusPengajuan: " + err)
    }
}

export async function reviewPengajuan(req, res) {
    console.log(`[Request Review Pengajuan]`)
    try {
        const hasilnya = await listAllPengajuan()
        console.log(`[Response Review Pengajuan] count: ${Array.isArray(hasilnya) ? hasilnya.length : 0}`)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        return res.json(hasilnya)
    } catch (err) {
        console.log(`[Error Review Pengajuan]:`, err)
        return res.status(500).json("salah dibagian controller reviewPengajuan: " + err)
    }
}

export async function approvePengajuan(req, res) {
    const { id } = req.params
    const { status } = req.body
    console.log(`[Request Approve Pengajuan] id: ${id}, status: ${status}`)
    try {
        const hasilnya = await changePengajuanStatus(id, status)
        console.log(`[Response Approve Pengajuan] hasil:`, hasilnya)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        return responseSucces(200, hasilnya, "status pengajuan berhasil diupdate", res)
    } catch (err) {
        console.log(`[Error Approve Pengajuan]:`, err)
        return res.status(500).json("salah dibagian controller approvePengajuan: " + err)
    }
}
