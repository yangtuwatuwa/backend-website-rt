import { createPengaduan, listPengaduanWarga, listAllPengaduan, changePengaduanStatus } from "../services/pengaduan.js"
import { responseSucces } from "../utils/response.js"

export async function addPengaduan(req, res) {
    const { isi, jenis_pengaduan } = req.body
    const userId = req.user.id
    try {
        const hasilnya = await createPengaduan(userId, isi, jenis_pengaduan)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        return responseSucces(200, hasilnya, "pengaduan berhasil terkirim", res)
    } catch (err) {
        console.log(err)
        return res.status(500).json("salah dibagian controller addPengaduan: " + err)
    }
}

export async function checkStatusPengaduan(req, res) {
    const userId = req.user.id
    try {
        const hasilnya = await listPengaduanWarga(userId)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        return res.json(hasilnya)
    } catch (err) {
        console.log(err)
        return res.status(500).json("salah dibagian controller checkStatusPengaduan: " + err)
    }
}

export async function reviewPengaduan(req, res) {
    try {
        const hasilnya = await listAllPengaduan()
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        return res.json(hasilnya)
    } catch (err) {
        console.log(err)
        return res.status(500).json("salah dibagian controller reviewPengaduan: " + err)
    }
}

export async function approvePengaduan(req, res) {
    const { id } = req.params
    const { status } = req.body
    try {
        const hasilnya = await changePengaduanStatus(id, status)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        return responseSucces(200, hasilnya, "status pengaduan berhasil diupdate", res)
    } catch (err) {
        console.log(err)
        return res.status(500).json("salah dibagian controller approvePengaduan: " + err)
    }
}
