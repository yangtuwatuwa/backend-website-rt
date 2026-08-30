import { inputAnnouncement, getAnnouncements, getAnnouncementById, updateAnnouncement, deleteAnnouncement } from "../models/announcement.js"

export async function addAnnouncement(judul, isi, executor = undefined) {
    try {
        if (!judul) {
            return "error: judul tidak boleh kosong masbro"
        }
        if (!isi) {
            return "error: isi tidak boleh kosong masbro"
        }
        const hasildbnya = await inputAnnouncement(judul, isi, executor)
        return hasildbnya
    } catch (err) {
        console.log(err)
        return "error mas di service: " + err
    }
}

export async function listAllAnnouncements(executor = undefined) {
    try {
        const hasilnya = await getAnnouncements(executor)
        return hasilnya
    } catch (err) {
        console.log(err)
        return "error mas di service: " + err
    }
}

export async function editAnnouncement(id, judul, isi, executor = undefined) {
    try {
        // 1. Cek apakah pengumuman ada
        const existing = await getAnnouncementById(id, executor)
        if (existing === "error" || !existing || existing.length === 0) {
            return "error: pengumuman tidak ditemukan mas"
        }
        
        // 2. Gunakan data lama jika field tidak di-update
        const finalJudul = judul !== undefined ? judul : existing[0].judul
        const finalIsi = isi !== undefined ? isi : existing[0].isi
        
        const hasildbnya = await updateAnnouncement(id, finalJudul, finalIsi, executor)
        return hasildbnya
    } catch (err) {
        console.log(err)
        return "error mas di service: " + err
    }
}

export async function removeAnnouncement(id, executor = undefined) {
    try {
        // 1. Cek apakah pengumuman ada
        const existing = await getAnnouncementById(id, executor)
        if (existing === "error" || !existing || existing.length === 0) {
            return "error: pengumuman tidak ditemukan mas"
        }
        
        const hasildbnya = await deleteAnnouncement(id, executor)
        return hasildbnya
    } catch (err) {
        console.log(err)
        return "error mas di service: " + err
    }
}
