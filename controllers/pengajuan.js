import { createPengajuan, listPengajuanWarga, listAllPengajuan, changePengajuanStatus } from "../services/pengajuan.js"
import { responseSucces } from "../utils/response.js"

export async function addPengajuan(req, res) {
    const { keperluan, jenis } = req.body
    const userId = req.user.id
    try {
        const hasilnya = await createPengajuan(userId, keperluan, jenis)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        return responseSucces(200, hasilnya, "pengajuan berhasil dikirim", res)
    } catch (err) {
        console.log(err)
        return res.status(500).json("salah dibagian controller addPengajuan: " + err)
    }
}

export async function checkStatusPengajuan(req, res) {
    const userId = req.user.id
    try {
        const hasilnya = await listPengajuanWarga(userId)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        return res.json(hasilnya)
    } catch (err) {
        console.log(err)
        return res.status(500).json("salah dibagian controller checkStatusPengajuan: " + err)
    }
}

export async function reviewPengajuan(req, res) {
    try {
        const hasilnya = await listAllPengajuan()
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        return res.json(hasilnya)
    } catch (err) {
        console.log(err)
        return res.status(500).json("salah dibagian controller reviewPengajuan: " + err)
    }
}

export async function approvePengajuan(req, res) {
    const { id } = req.params
    const { status } = req.body
    try {
        const hasilnya = await changePengajuanStatus(id, status)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        return responseSucces(200, hasilnya, "status pengajuan berhasil diupdate", res)
    } catch (err) {
        console.log(err)
        return res.status(500).json("salah dibagian controller approvePengajuan: " + err)
    }
}
