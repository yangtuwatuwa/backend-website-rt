import { inputPengajuan, getPengajuanById, getPengajuanByFamily, getAllPengajuan, updatePengajuanStatus, updatePengajuanArchivedStatus } from "../models/pengajuan.js"
import { getAccountById } from "../models/login.js"
import { decryptEmails } from "../helpers/ciihper.js"
import { maskData } from "../utils/masking.js"
import { createNotification } from "./notificationService.js"

export async function createPengajuan(userId, keperluan, jenis) {
    try {
        const dataUser = await getAccountById(userId)
        if (dataUser === "error" || dataUser.length === 0) {
            return "error: akun warga tidak ditemukan"
        }
        
        const familyId = dataUser[0].family_id
        if (!familyId) {
            return "error: warga belum terikat dengan KK mana pun"
        }
        
        const hasildbnya = await inputPengajuan(familyId, keperluan, jenis)
        return hasildbnya
    } catch (err) {
        console.log(err)
        return "error mas di service: " + err
    }
}

export async function listPengajuanWarga(userId) {
    try {
        const dataUser = await getAccountById(userId)
        if (dataUser === "error" || dataUser.length === 0) {
            return "error: akun warga tidak ditemukan"
        }
        
        const familyId = dataUser[0].family_id
        if (!familyId) {
            return "error: warga belum terikat dengan KK mana pun"
        }
        
        const hasilnya = await getPengajuanByFamily(familyId)
        if (!Array.isArray(hasilnya)) return hasilnya

        return hasilnya.map(p => ({
            ...p,
            is_archived: Boolean(p.is_archived),
            is_archived_bool: Boolean(p.is_archived)
        }))
    } catch (err) {
        console.log(err)
        return "error mas di service: " + err
    }
}

export async function listAllPengajuan() {
    try {
        const hasilnya = await getAllPengajuan()
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return hasilnya
        }

        const decryptedList = hasilnya.map(p => {
            try {
                return {
                    ...p,
                    is_archived: Boolean(p.is_archived),
                    is_archived_bool: Boolean(p.is_archived),
                    no_kk: p.no_kk ? maskData(decryptEmails(p.no_kk)) : null
                }
            } catch (decErr) {
                return {
                    ...p,
                    is_archived: Boolean(p.is_archived),
                    is_archived_bool: Boolean(p.is_archived)
                }
            }
        })
        return decryptedList
    } catch (err) {
        console.log(err)
        return "error mas di service: " + err
    }
}

export async function changePengajuanStatus(id, status) {
    const allowedStatus = ["pending", "disetujui", "ditolak"]
    if (!allowedStatus.includes(status)) {
        return "error: status harus pending, disetujui, atau ditolak masbro"
    }

    try {
        const suratData = await getPengajuanById(id)
        const hasildbnya = await updatePengajuanStatus(id, status)

        if (suratData && suratData.family_id) {
            try {
                const cleanStatus = status.charAt(0).toUpperCase() + status.slice(1);
                const jenisSurat = suratData.jenis || "Surat Pengantar";
                const notifMsg = `Pengajuan surat Anda (${jenisSurat}) kini berstatus "${cleanStatus}".`;

                await createNotification({
                    familyId: suratData.family_id,
                    type: "surat",
                    title: `Status Pengajuan Surat: ${cleanStatus}`,
                    message: notifMsg,
                    referenceType: "letter",
                    referenceId: id
                });
            } catch (ne) {
                console.error("Non-blocking error notifikasi pengajuan surat:", ne.message);
            }
        }

        return hasildbnya
    } catch (err) {
        console.log(err)
        return "error mas di service: " + err
    }
}

export async function archivePengajuanService(id, isArchived = true) {
    try {
        const hasildbnya = await updatePengajuanArchivedStatus(id, isArchived)
        return hasildbnya
    } catch (err) {
        console.log(err)
        return "error mas di service archivePengajuanService: " + err
    }
}

