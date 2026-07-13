import { inputPengaduan, getPengaduanByFamily, getAllPengaduan, updatePengaduanStatus } from "../models/pengaduan.js"
import { getAccountById } from "../models/login.js"
import { decryptEmails } from "../helpers/ciihper.js"
import { maskData } from "../utils/masking.js"

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

export async function changePengaduanStatus(id, status) {
    const allowedStatus = ["pending", "disetujui", "ditolak"]
    if (!allowedStatus.includes(status)) {
        return "error: status harus pending, disetujui, atau ditolak masbro"
    }

    try {
        const hasildbnya = await updatePengaduanStatus(id, status)
        return hasildbnya
    } catch (err) {
        console.log(err)
        return "error mas di service: " + err
    }
}
