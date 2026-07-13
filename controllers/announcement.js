import { addAnnouncement, listAllAnnouncements, editAnnouncement, removeAnnouncement } from "../services/announcement.js"
import { responseSucces } from "../utils/response.js"

export async function createAnnouncementController(req, res) {
    const { judul, isi } = req.body
    try {
        const hasilnya = await addAnnouncement(judul, isi)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        return responseSucces(200, hasilnya, "pengumuman berhasil dibuat masbro", res)
    } catch (err) {
        console.log(err)
        return res.status(500).json("salah dibagian controller createAnnouncement: " + err)
    }
}

export async function getAnnouncementsController(req, res) {
    try {
        const hasilnya = await listAllAnnouncements()
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        return res.json(hasilnya)
    } catch (err) {
        console.log(err)
        return res.status(500).json("salah dibagian controller getAnnouncements: " + err)
    }
}

export async function editAnnouncementController(req, res) {
    const { id } = req.params
    const { judul, isi } = req.body
    try {
        const hasilnya = await editAnnouncement(id, judul, isi)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        return responseSucces(200, hasilnya, "pengumuman berhasil diperbarui masbro", res)
    } catch (err) {
        console.log(err)
        return res.status(500).json("salah dibagian controller editAnnouncement: " + err)
    }
}

export async function removeAnnouncementController(req, res) {
    const { id } = req.params
    try {
        const hasilnya = await removeAnnouncement(id)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        return responseSucces(200, hasilnya, "pengumuman berhasil dihapus masbro", res)
    } catch (err) {
        console.log(err)
        return res.status(500).json("salah dibagian controller removeAnnouncement: " + err)
    }
}
