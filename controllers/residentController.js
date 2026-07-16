import { warganyain, listWarga, updateWargaService, searchWargaService } from "../services/inputdbwarga.js"
import { logicWarganya, listWarganya } from "../services/inputDataWarga.js"
import { responseSucces } from "../utils/response.js"
import editResident from "../services/editedResident.js"
import { inputWarga, listRumah } from "../services/inputHouse.js"
import { getAccountById } from "../models/login.js"
import { getWargaById } from "../models/inputwarganya.js"
import { getFamilyById } from "../models/resident.js"
import { decryptEmails } from "../helpers/ciihper.js"
import { argonverify } from "../helpers/argon2.js"

export async function inputData(req, res) {
    const { noKK, home, KepalaKeluarga } = req.body
    console.log(`[Request Input Data Warga] noKK: ${noKK}, home: ${home}, KepalaKeluarga: ${KepalaKeluarga}`)

    try {
        const warga = await logicWarganya(noKK, home, KepalaKeluarga)
        console.log(`[Response Input Data Warga] hasil:`, warga)
        if (typeof warga === "string" && warga.startsWith("error")) {
            return res.status(400).json(warga)
        }
        return responseSucces(200, warga, "masuk dengan sempurna ", res)
    } catch (err) {
        console.log(`[Error Input Data Warga]:`, err)
        return res.status(500).json("error mas di controllers: " + err)
    }
}

export async function getResident(req, res) {
    console.log(`[Request Get Resident]`)
    try {
        const warga = await listWarganya()
        console.log(`[Response Get Resident] count: ${Array.isArray(warga) ? warga.length : 0}`)
        if (typeof warga === "string" && warga.startsWith("error")) {
            return res.status(400).json(warga)
        }
        return res.json(warga)
    } catch (err) {
        console.log(`[Error Get Resident]:`, err)
        return res.status(500).json("error mas di controllers: " + err)
    }
}

export async function editedResident(req, res) {
    const { id } = req.params;
    const { noKK } = req.body;
    console.log(`[Request Edited Resident] id: ${id}, noKK: ${noKK}`)

    try {
        const warga = await editResident(id, noKK)
        console.log(`[Response Edited Resident] hasil:`, warga)
        if (typeof warga === "string" && (warga.startsWith("salah") || warga.startsWith("error"))) {
            return res.status(400).json(warga)
        }
        return responseSucces(200, warga, "Berhasil mengubah data warga", res)
    } catch (err) {
        console.log(`[Error Edited Resident]:`, err)
        return res.status(500).json("error mas di controllers: " + err)
    }
}

export async function inputHouse(req, res) {
    const { blok, nomor, alamat, status } = req.body
    console.log(`[Request Input House] blok: ${blok}, nomor: ${nomor}, alamat: ${alamat}, status: ${status}`)
    try {
        const hasilnya = await inputWarga(blok, nomor, alamat, status)
        console.log(`[Response Input House] hasil:`, hasilnya)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json(hasilnya)
        }
        return responseSucces(200, hasilnya, "data nya sudah terkirim ", res)
    } catch (error) {
        console.log(`[Error Input House]:`, error)
        return res.status(500).json("data tidak terkirim " + error)
    }
}

export async function warga(req, res) {
    const { nik, nama, jenisKelamin, tglLahir, statusHidup, noHp, umur, fammilyId, houseId } = req.body
    console.log(`[Request Input Detail Warga] nik: ${nik}, nama: ${nama}, familyId: ${fammilyId}, houseId: ${houseId}`)
    try {
        const hasilnya = await warganyain(nik, nama, jenisKelamin, tglLahir, statusHidup, noHp, umur, fammilyId, houseId)
        console.log(`[Response Input Detail Warga] hasil:`, hasilnya)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json(hasilnya)
        }
        return responseSucces(200, hasilnya, "masuk dengan sempurnaaa", res)
    } catch (err) {
        console.log(`[Error Input Detail Warga]:`, err)
        return res.status(500).json("salah dibagian warga controller: " + err)
    }
}

export async function getHouse(req, res) {
    console.log(`[Request Get House]`)
    try {
        const rumah = await listRumah()
        console.log(`[Response Get House] count: ${Array.isArray(rumah) ? rumah.length : 0}`)
        if (typeof rumah === "string" && rumah.startsWith("error")) {
            return res.status(400).json(rumah)
        }
        return res.json(rumah)
    } catch (err) {
        console.log(`[Error Get House]:`, err)
        return res.status(500).json("error mas di controllers: " + err)
    }
}

export async function getWarga(req, res) {
    console.log(`[Request Get Warga]`)
    try {
        const warga = await listWarga()
        console.log(`[Response Get Warga] count: ${Array.isArray(warga) ? warga.length : 0}`)
        if (typeof warga === "string" && warga.startsWith("error")) {
            return res.status(400).json(warga)
        }
        return res.json(warga)
    } catch (err) {
        console.log(`[Error Get Warga]:`, err)
        return res.status(500).json("error mas di controllers: " + err)
    }
}

export async function revealWarga(req, res) {
    const { id } = req.params
    const { password } = req.body
    const userId = req.user.id
    console.log(`[Request Reveal Warga] targetId: ${id}, byUserId: ${userId}`)

    try {
        const dataUser = await getAccountById(userId)
        if (dataUser === "error" || dataUser.length === 0) {
            console.log(`[Response Reveal Warga] Gagal: Akun tidak ditemukan`)
            return res.status(404).json({ pesan: "Akun tidak ditemukan mas" })
        }

        const match = await argonverify(dataUser[0].password, password)
        if (!match) {
            console.log(`[Response Reveal Warga] Gagal: Password verifikasi salah`)
            return res.status(401).json({ pesan: "Password verifikasi salah, cuy!" })
        }

        const warga = await getWargaById(id)
        if (!warga || (typeof warga === "string" && warga.startsWith("error"))) {
            console.log(`[Response Reveal Warga] Gagal: Data warga tidak ditemukan`)
            return res.status(404).json({ pesan: "Data warga tidak ditemukan" })
        }

        const nikAsli = decryptEmails(warga.nik)
        console.log(`[Response Reveal Warga] sukses`)
        return res.json({ nik: nikAsli })

    } catch (err) {
        console.log(`[Error Reveal Warga]:`, err)
        return res.status(500).json({ pesan: "error mas di controller revealWarga: " + err })
    }
}

export async function revealFamily(req, res) {
    const { id } = req.params
    const { password } = req.body
    const userId = req.user.id
    console.log(`[Request Reveal Family] targetId: ${id}, byUserId: ${userId}`)

    try {
        const dataUser = await getAccountById(userId)
        if (dataUser === "error" || dataUser.length === 0) {
            console.log(`[Response Reveal Family] Gagal: Akun tidak ditemukan`)
            return res.status(404).json({ pesan: "Akun tidak ditemukan mas" })
        }

        const match = await argonverify(dataUser[0].password, password)
        if (!match) {
            console.log(`[Response Reveal Family] Gagal: Password verifikasi salah`)
            return res.status(401).json({ pesan: "Password verifikasi salah, cuy!" })
        }

        const family = await getFamilyById(id)
        if (!family || (typeof family === "string" && family.startsWith("error"))) {
            console.log(`[Response Reveal Family] Gagal: Data KK tidak ditemukan`)
            return res.status(404).json({ pesan: "Data KK tidak ditemukan" })
        }

        const kkAsli = decryptEmails(family.no_kk)
        console.log(`[Response Reveal Family] sukses`)
        return res.json({ no_kk: kkAsli })

    } catch (err) {
        console.log(`[Error Reveal Family]:`, err)
        return res.status(500).json({ pesan: "error mas di controller revealFamily: " + err })
    }
}

export async function createWargaByResident(req, res) {
    const { nik, nama, jenisKelamin, tglLahir, statusHidup, noHp, umur } = req.body
    const userId = req.user.id
    console.log(`[Request Create Warga By Resident] nik: ${nik}, nama: ${nama}, byUserId: ${userId}`)
    try {
        const dataUser = await getAccountById(userId)
        if (!dataUser || dataUser === "error" || dataUser.length === 0) {
            console.log(`[Response Create Warga By Resident] Gagal: Akun tidak ditemukan`)
            return res.status(404).json({ pesan: "Akun tidak ditemukan mas" })
        }

        const familyId = dataUser[0].family_id
        if (!familyId) {
            console.log(`[Response Create Warga By Resident] Gagal: Akun tidak memiliki familyId`)
            return res.status(400).json({ pesan: "Akun anda belum terikat dengan KK mana pun" })
        }

        const familyData = await getFamilyById(familyId)
        if (!familyData || (typeof familyData === "string" && familyData.startsWith("error"))) {
            console.log(`[Response Create Warga By Resident] Gagal: Data KK tidak ditemukan`)
            return res.status(404).json({ pesan: "Data KK keluarga tidak ditemukan" })
        }

        const houseId = familyData.house_id

        const hasilnya = await warganyain(nik, nama, jenisKelamin, tglLahir, statusHidup, noHp, umur, familyId, houseId, "diterima")
        console.log(`[Response Create Warga By Resident] hasil:`, hasilnya)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        return responseSucces(200, hasilnya, "pendaftaran anggota keluarga berhasil, data langsung aktif masbro!", res)
    } catch (err) {
        console.log(`[Error Create Warga By Resident]:`, err)
        return res.status(500).json({ pesan: "salah dibagian controller createWargaByResident: " + err })
    }
}

export async function updateWargaDetailsController(req, res) {
    const { id } = req.params
    const { nama, jenisKelamin, tglLahir, statusHidup, noHp, umur } = req.body
    const userId = req.user.id
    console.log(`[Request Update Warga Details] targetId: ${id}, byUserId: ${userId}`)

    try {
        const dataUser = await getAccountById(userId)
        if (!dataUser || dataUser === "error" || dataUser.length === 0) {
            console.log(`[Response Update Warga Details] Gagal: Akun tidak ditemukan`)
            return res.status(404).json({ pesan: "Akun tidak ditemukan mas" })
        }

        const warga = await getWargaById(id)
        if (!warga || (typeof warga === "string" && warga.startsWith("error"))) {
            console.log(`[Response Update Warga Details] Gagal: Data warga tidak ditemukan`)
            return res.status(404).json({ pesan: "Data warga tidak ditemukan" })
        }

        const userRole = req.user.role
        if (userRole === "bendahara") {
            console.log(`[Response Update Warga Details] Gagal: Bendahara tidak memiliki akses`)
            return res.status(403).json({ pesan: "Akses ditolak, bendahara tidak diizinkan mengubah data warga!" })
        }

        if (userRole === "warga") {
            const userFamilyId = dataUser[0].family_id
            if (String(userFamilyId) !== String(warga.family_id)) {
                console.log(`[Response Update Warga Details] Gagal: Akses ditolak karena berbeda KK`)
                return res.status(403).json({ pesan: "Akses ditolak, ini bukan data keluarga lu cuy!" })
            }
        }

        const dataToUpdate = { nama, jenisKelamin, tglLahir, statusHidup, noHp, umur }
        Object.keys(dataToUpdate).forEach(key => dataToUpdate[key] === undefined && delete dataToUpdate[key])

        if (Object.keys(dataToUpdate).length === 0) {
            console.log(`[Response Update Warga Details] Gagal: Tidak ada data yang dikirim untuk diupdate`)
            return res.status(400).json({ pesan: "Kirim data yang mau di-update dong masbro!" })
        }

        const hasilnya = await updateWargaService(id, dataToUpdate)
        console.log(`[Response Update Warga Details] hasil:`, hasilnya)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }

        return responseSucces(200, hasilnya, "Data warga berhasil diperbarui cuy!", res)
    } catch (err) {
        console.log(`[Error Update Warga Details]:`, err)
        return res.status(500).json({ pesan: "error mas di controller updateWargaDetailsController: " + err })
    }
}

export async function searchResidentController(req, res) {
    const { q } = req.query
    console.log(`[Request Search Resident] query: ${q}`)
    try {
        const warga = await searchWargaService(q)
        console.log(`[Response Search Resident] count: ${Array.isArray(warga) ? warga.length : 0}`)
        if (typeof warga === "string" && warga.startsWith("error")) {
            return res.status(400).json({ pesan: warga })
        }
        return res.json(warga)
    } catch (err) {
        console.log(`[Error Search Warga]:`, err)
        return res.status(500).json({ pesan: "error mas di controller searchResidentController: " + err })
    }
}
