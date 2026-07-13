import { inputAnnouncement, getAnnouncements, getAnnouncementById, updateAnnouncement, deleteAnnouncement } from "../models/announcement.js"

export async function addAnnouncement(judul, isi) {
    try {
        if (!judul) {
            return "error: judul tidak boleh kosong masbro"
        }
        if (!isi) {
            return "error: isi tidak boleh kosong masbro"
        }
        const hasildbnya = await inputAnnouncement(judul, isi)
        return hasildbnya
    } catch (err) {
        console.log(err)
        return "error mas di service: " + err
    }
}

export async function listAllAnnouncements() {
    try {
        const hasilnya = await getAnnouncements()
        return hasilnya
    } catch (err) {
        console.log(err)
        return "error mas di service: " + err
    }
}

export async function editAnnouncement(id, judul, isi) {
    try {
        // 1. Cek apakah pengumuman ada
        const existing = await getAnnouncementById(id)
        if (existing === "error" || !existing || existing.length === 0) {
            return "error: pengumuman tidak ditemukan mas"
        }
        
        // 2. Gunakan data lama jika field tidak di-update
        const finalJudul = judul !== undefined ? judul : existing[0].judul
        const finalIsi = isi !== undefined ? isi : existing[0].isi
        
        const hasildbnya = await updateAnnouncement(id, finalJudul, finalIsi)
        return hasildbnya
    } catch (err) {
        console.log(err)
        return "error mas di service: " + err
    }
}

export async function removeAnnouncement(id) {
    try {
        // 1. Cek apakah pengumuman ada
        const existing = await getAnnouncementById(id)
        if (existing === "error" || !existing || existing.length === 0) {
            return "error: pengumuman tidak ditemukan mas"
        }
        
        const hasildbnya = await deleteAnnouncement(id)
        return hasildbnya
    } catch (err) {
        console.log(err)
        return "error mas di service: " + err
    }
}
