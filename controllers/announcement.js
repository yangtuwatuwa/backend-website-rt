import { addAnnouncement, listAllAnnouncements, editAnnouncement, removeAnnouncement } from "../services/announcement.js"
import { responseSucces } from "../utils/response.js"
import { emitSyncEvent } from "../utils/socket.js"

export async function createAnnouncementController(req, res) {
    const { judul, isi } = req.body
    console.log(`[Request Create Announcement] judul: ${judul}, isi: ${isi}`)
    try {
        const hasilnya = await addAnnouncement(judul, isi)
        console.log(`[Response Create Announcement] hasil:`, hasilnya)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        emitSyncEvent("announcement")
        return responseSucces(200, hasilnya, "pengumuman berhasil dibuat masbro", res)
    } catch (err) {
        console.log(`[Error Create Announcement]:`, err)
        return res.status(500).json("salah dibagian controller createAnnouncement: " + err)
    }
}

export async function getAnnouncementsController(req, res) {
    console.log(`[Request Get Announcements]`)
    try {
        const hasilnya = await listAllAnnouncements()
        console.log(`[Response Get Announcements] count: ${Array.isArray(hasilnya) ? hasilnya.length : 0}`)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        return res.json(hasilnya)
    } catch (err) {
        console.log(`[Error Get Announcements]:`, err)
        return res.status(500).json("salah dibagian controller getAnnouncements: " + err)
    }
}

export async function editAnnouncementController(req, res) {
    const { id } = req.params
    const { judul, isi } = req.body
    console.log(`[Request Edit Announcement] id: ${id}, judul: ${judul}, isi: ${isi}`)
    try {
        const hasilnya = await editAnnouncement(id, judul, isi)
        console.log(`[Response Edit Announcement] hasil:`, hasilnya)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        emitSyncEvent("announcement")
        return responseSucces(200, hasilnya, "pengumuman berhasil diperbarui masbro", res)
    } catch (err) {
        console.log(`[Error Edit Announcement]:`, err)
        return res.status(500).json("salah dibagian controller editAnnouncement: " + err)
    }
}

export async function removeAnnouncementController(req, res) {
    const { id } = req.params
    console.log(`[Request Remove Announcement] id: ${id}`)
    try {
        const hasilnya = await removeAnnouncement(id)
        console.log(`[Response Remove Announcement] hasil:`, hasilnya)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        emitSyncEvent("announcement")
        return responseSucces(200, hasilnya, "pengumuman berhasil dihapus masbro", res)
    } catch (err) {
        console.log(`[Error Remove Announcement]:`, err)
        return res.status(500).json("salah dibagian controller removeAnnouncement: " + err)
    }
}
