import { inputPengaduan, getPengaduanById, getPengaduanByFamily, getAllPengaduan, updatePengaduanStatus, deletePengaduan } from "../models/pengaduan.js"
import { getAccountById } from "../models/login.js"
import { decryptEmails } from "../helpers/ciihper.js"
import { maskData } from "../utils/masking.js"
import { createNotification } from "./notificationService.js"

export async function createPengaduan(userId, isi, jenis_pengaduan) {
    try {
        const dataUser = await getAccountById(userId)
        if (dataUser === "error" || dataUser.length === 0) {
            return "error: akun warga tidak ditemukan"
        }
        
        const familyId = dataUser[0].family_id
        if (!familyId) {
            return "error: warga belum terikat dengan KK mana pun"
        }
        
        const hasildbnya = await inputPengaduan(familyId, isi, jenis_pengaduan)
        return hasildbnya
    } catch (err) {
        console.log(err)
        return "error mas di service: " + err
    }
}

export async function listPengaduanWarga(userId) {
    try {
        const dataUser = await getAccountById(userId)
        if (dataUser === "error" || dataUser.length === 0) {
            return "error: akun warga tidak ditemukan"
        }
        
        const familyId = dataUser[0].family_id
        if (!familyId) {
            return "error: warga belum terikat dengan KK mana pun"
        }
        
        const hasildbnya = await getPengaduanByFamily(familyId)
        return hasildbnya
    } catch (err) {
        console.log(err)
        return "error mas di service: " + err
    }
}

export async function listAllPengaduan() {
    try {
        const hasilnya = await getAllPengaduan()
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return hasilnya
        }

        const decryptedList = hasilnya.map(p => {
            try {
                return {
                    ...p,
                    no_kk: p.no_kk ? maskData(decryptEmails(p.no_kk)) : null
                }
            } catch (decErr) {
                return p
            }
        })
        return decryptedList
    } catch (err) {
        console.log(err)
        return "error mas di service: " + err
    }
}

export async function changePengaduanStatus(id, status, catatan = null) {
    const allowedStatus = ["pending", "disetujui", "ditolak", "proses", "selesai", "Proses", "Selesai"]
    if (status && !allowedStatus.includes(status)) {
        return "error: status harus pending, disetujui, ditolak, Proses, atau Selesai masbro"
    }

    try {
        const pengaduanData = await getPengaduanById(id)
        const hasildbnya = await updatePengaduanStatus(id, status, catatan)

        if (pengaduanData && pengaduanData.family_id) {
            try {
                const cleanStatus = status.charAt(0).toUpperCase() + status.slice(1);
                const descSnippet = pengaduanData.isi ? (pengaduanData.isi.length > 50 ? pengaduanData.isi.substring(0, 50) + "..." : pengaduanData.isi) : "Pengaduan";
                const notifMsg = `Laporan pengaduan Anda ("${descSnippet}") kini berstatus "${cleanStatus}"${catatan ? `. Catatan: ${catatan}` : ''}.`;
                
                await createNotification({
                    familyId: pengaduanData.family_id,
                    type: "pengaduan",
                    title: `Status Pengaduan: ${cleanStatus}`,
                    message: notifMsg,
                    referenceType: "report",
                    referenceId: id
                });
            } catch (ne) {
                console.error("Non-blocking error notifikasi pengaduan:", ne.message);
            }
        }

        return hasildbnya
    } catch (err) {
        console.log(err)
        return "error mas di service: " + err
    }
}

export async function removePengaduan(id) {
    try {
        const hasildbnya = await deletePengaduan(id)
        return hasildbnya
    } catch (err) {
        console.log(err)
        return "error mas di service: " + err
    }
}

