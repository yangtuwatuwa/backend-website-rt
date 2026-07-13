import { inputPengajuan, getPengajuanByFamily, getAllPengajuan, updatePengajuanStatus } from "../models/pengajuan.js"
import { getAccountById } from "../models/login.js"
import { decryptEmails } from "../helpers/ciihper.js"
import { maskData } from "../utils/masking.js"

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
        
        const hasildbnya = await getPengajuanByFamily(familyId)
        return hasildbnya
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

export async function changePengajuanStatus(id, status) {
    const allowedStatus = ["pending", "disetujui", "ditolak"]
    if (!allowedStatus.includes(status)) {
        return "error: status harus pending, disetujui, atau ditolak masbro"
    }

    try {
        const hasildbnya = await updatePengajuanStatus(id, status)
        return hasildbnya
    } catch (err) {
        console.log(err)
        return "error mas di service: " + err
    }
}
