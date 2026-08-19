import { warganyain, listWarga, updateWargaService, searchWargaService } from "../services/inputdbwarga.js"
import { logicWarganya, listWarganya } from "../services/inputDataWarga.js"
import { responseSucces } from "../utils/response.js"
import { emitSyncEvent } from "../utils/socket.js"
import editResident from "../services/editedResident.js"
import { inputWarga, listRumah } from "../services/inputHouse.js"
import { getAccountById, getAccountByIdWithAuth } from "../models/login.js"
import { getWargaById, isKepalaKeluarga, deleteWargaById, getOtherFamilyMembers, updateFamilyHead, updateWargaNik, updateFamilyNoKk } from "../models/inputwarganya.js"
import { getFamilyById, getPopulationStats, getKepalaKeluargaList } from "../models/resident.js"
import { encryptEmails, decryptEmails } from "../helpers/ciihper.js"
import { argonverify } from "../helpers/argon2.js"
import { getHouseById } from "../models/houseWarga.js"
import { createDocument } from "../models/document.js"
import fs from "fs"



export async function inputData(req, res) {
    const { noKK, home, houseId, house_id, KepalaKeluarga, kepalaKeluarga, kepala_keluarga_id } = req.body
    const targetHouseId = home || houseId || house_id
    const targetHeadId = KepalaKeluarga || kepalaKeluarga || kepala_keluarga_id || null
    console.log(`[Request Input Data Warga / KK] noKK: ${noKK}, houseId: ${targetHouseId}, kepalaKeluarga: ${targetHeadId}`)

    if (!noKK) {
        return res.status(400).json({ pesan: "Nomor KK wajib diisi masbro!" })
    }
    if (!targetHouseId) {
        return res.status(400).json({ pesan: "ID Rumah (houseId) wajib diisi masbro!" })
    }

    try {
        const warga = await logicWarganya(noKK, targetHouseId, targetHeadId)
        console.log(`[Response Input Data Warga / KK] hasil:`, warga)
        if (typeof warga === "string" && warga.startsWith("error")) {
            return res.status(400).json({ pesan: warga })
        }
        emitSyncEvent("warga")
        return responseSucces(200, warga, "Data KK berhasil ditambahkan masbro", res)
    } catch (err) {
        console.log(`[Error Input Data Warga / KK]:`, err)
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
        emitSyncEvent("warga")
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
    const { nik, nama, jenisKelamin, tglLahir, statusHidup, noHp, umur, fammilyId, familyId, family_id, houseId, house_id, isKepalaKeluarga, is_kepala_keluarga } = req.body
    const targetFamilyId = fammilyId || familyId || family_id
    const targetHouseId = houseId || house_id
    console.log(`[Request Input Detail Warga] nik: ${nik}, nama: ${nama}, familyId: ${targetFamilyId}, houseId: ${targetHouseId}`)

    if (!nik || !nama || !targetFamilyId || !targetHouseId) {
        return res.status(400).json({ pesan: "NIK, Nama, familyId, dan houseId wajib diisi masbro!" })
    }

    try {
        const hasilnya = await warganyain(nik, nama, jenisKelamin, tglLahir, statusHidup, noHp, umur, targetFamilyId, targetHouseId, "diterima", isKepalaKeluarga || is_kepala_keluarga)
        console.log(`[Response Input Detail Warga] hasil:`, hasilnya)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        emitSyncEvent("warga")
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
        const dataUser = await getAccountByIdWithAuth(userId)
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
        const dataUser = await getAccountByIdWithAuth(userId)
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
    const { nik, nama, jenisKelamin, tglLahir, statusHidup, noHp, umur, isKepalaKeluarga, is_kepala_keluarga } = req.body
    const userId = req.user.id
    const file = req.file
    console.log(`[Request Create Warga By Resident] byUserId: ${userId}, nik: ${nik}, nama: ${nama}`)
    try {
        const dataUser = await getAccountById(userId)
        if (!dataUser || dataUser === "error" || dataUser.length === 0) {
            if (file && file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path)
            console.log(`[Response Create Warga By Resident] Gagal: Akun tidak ditemukan`)
            return res.status(404).json({ pesan: "Akun tidak ditemukan mas" })
        }

        const familyId = dataUser[0].family_id
        if (!familyId) {
            if (file && file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path)
            console.log(`[Response Create Warga By Resident] Gagal: Akun tidak memiliki familyId`)
            return res.status(400).json({ pesan: "Akun anda belum terikat dengan KK mana pun" })
        }

        const familyData = await getFamilyById(familyId)
        if (!familyData || (typeof familyData === "string" && familyData.startsWith("error"))) {
            if (file && file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path)
            console.log(`[Response Create Warga By Resident] Gagal: Data KK tidak ditemukan`)
            return res.status(404).json({ pesan: "Data KK keluarga tidak ditemukan" })
        }

        const houseId = familyData.house_id
        const houseData = houseId ? await getHouseById(houseId) : null
        
        // Deteksi apakah rumah berstatus kontrakan / sewa
        const houseStatusStr = String(houseData?.status || "").toLowerCase()
        const isKontrak = houseStatusStr.includes("kontrak") || houseStatusStr.includes("sewa") || houseStatusStr.includes("ngontrak")

        // Jika rumah berstatus kontrakan/sewa -> "pending" (membutuhkan persetujuan RT)
        // Jika rumah berstatus tetap/pribadi/milik sendiri -> langsung "diterima" (aktif)
        const initialStatus = isKontrak ? "pending" : "diterima"

        const hasilnya = await warganyain(nik, nama, jenisKelamin, tglLahir, statusHidup, noHp, umur, familyId, houseId, initialStatus, isKepalaKeluarga || is_kepala_keluarga)
        console.log(`[Response Create Warga By Resident] hasil:`, hasilnya)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            if (file && file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path)
            return res.status(400).json({ pesan: hasilnya })
        }

        const newCitizenId = hasilnya.insertId || null
        let documentId = null

        // Jika file berkas identitas diunggah bersamaan dengan pendaftaran warga (1-step upload)
        if (file && newCitizenId) {
            try {
                const requestedType = req.body.type || req.body.document_type;
                const calcUmur = Number(umur) || 0;
                const finalDocType = requestedType || (calcUmur > 0 && calcUmur < 17 ? "kia" : "ktp");
                
                const docRes = await createDocument(familyId, newCitizenId, finalDocType, file.filename)
                if (docRes && docRes.insertId) {
                    documentId = docRes.insertId
                }
            } catch (docErr) {
                console.log("[Warning] Gagal me-link file berkas identitas di createWargaByResident:", docErr)
            }
        }

        emitSyncEvent("warga")

        const pesanSuccess = isKontrak
            ? "Pendaftaran anggota keluarga berhasil diajukan! Karena status rumah keluarga anda adalah kontrakan/sewa, data warga berstatus PENDING dan membutuhkan verifikasi/persetujuan dari RT."
            : "Pendaftaran anggota keluarga berhasil! Karena status rumah adalah tetap/pribadi, data warga langsung DITERIMA (aktif)."

        return responseSucces(200, {
            warga_id: newCitizenId,
            status: initialStatus,
            house_status: houseData?.status || "tetap",
            is_kontrak: isKontrak,
            document_id: documentId,
            has_ktp: Boolean(file || documentId)
        }, pesanSuccess, res)
    } catch (err) {
        console.log(`[Error Create Warga By Resident]:`, err)
        if (file && file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path)
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

        emitSyncEvent("warga")
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

export async function getPopulationStatsController(req, res) {
    console.log(`[Request Get Population Stats]`)
    try {
        const stats = await getPopulationStats()
        console.log(`[Response Get Population Stats]`, stats)
        if (typeof stats === "string" && stats.startsWith("error")) {
            return res.status(400).json({ pesan: stats })
        }
        return responseSucces(200, stats, "Data statistik kependudukan RT berhasil diambil masbro", res)
    } catch (err) {
        console.log(`[Error Get Population Stats]:`, err)
        return res.status(500).json({ pesan: "error mas di controller getPopulationStatsController: " + err })
    }
}

/**
 * Hapus data warga berdasarkan ID.
 * RULES:
 * - Kepala keluarga TIDAK BOLEH dihapus (proteksi)
 * - Hanya bisa diakses oleh RT dan Sekretaris
 * - Warga harus exist di database
 */
export async function deleteWargaController(req, res) {
    const { id } = req.params
    console.log(`[Request Delete Warga] targetId: ${id}, byUserId: ${req.user.id}, role: ${req.user.role}`)

    try {
        // 1. Cek apakah warga dengan ID ini ada
        const warga = await getWargaById(id)
        if (!warga || (typeof warga === "string" && warga.startsWith("error"))) {
            console.log(`[Response Delete Warga] Gagal: Warga id ${id} tidak ditemukan`)
            return res.status(404).json({ 
                success: false,
                pesan: "Data warga tidak ditemukan" 
            })
        }

        // 2. Cek apakah warga ini terdaftar sebagai kepala_keluarga_id di tabel family
        const isHead = await isKepalaKeluarga(id)
        if (isHead && warga.family_id) {
            // Cek apakah ada anggota keluarga lain di KK ini
            const otherMembers = await getOtherFamilyMembers(warga.family_id, id)
            if (otherMembers && otherMembers.length > 0) {
                // Auto-healing: Pindahkan kepala_keluarga_id ke anggota keluarga lain (warga paling lama)
                const newHead = otherMembers[0]
                await updateFamilyHead(warga.family_id, newHead.id)
                console.log(`[Auto-Heal Delete] Warga ID ${id} terdaftar sebagai Kepala Keluarga. Kepala keluarga dipindahkan ke ${newHead.nama} (ID ${newHead.id}).`)
            } else {
                // Satu-satunya anggota & Kepala Keluarga -> Blokir untuk mencegah orphan data / KK kosong
                console.log(`[Response Delete Warga] Gagal: Warga id ${id} adalah satu-satunya Kepala Keluarga di KK ini`)
                return res.status(403).json({ 
                    success: false,
                    pesan: "Warga ini adalah satu-satunya Kepala Keluarga di KK ini. Hapus atau alihkan Kartu Keluarga (KK) terlebih dahulu." 
                })
            }
        }

        // 3. Hapus warga aman tanpa orphan data
        const result = await deleteWargaById(id)
        console.log(`[Response Delete Warga] Sukses: Warga id ${id} (${warga.nama}) berhasil dihapus`)

        emitSyncEvent("warga")

        return res.status(200).json({
            success: true,
            response: 200,
            data: {
                deletedId: Number(id),
                nama: warga.nama,
                family_id: warga.family_id
            },
            message: `Data warga "${warga.nama}" berhasil dihapus dari sistem`
        })

    } catch (err) {
        console.log(`[Error Delete Warga]:`, err)
        return res.status(500).json({ 
            success: false,
            pesan: "error mas di controller deleteWargaController: " + err 
        })
    }
}

/**
 * Edit NIK warga berdasarkan ID warga.
 * Hanya RT & Sekretaris yang boleh mengubah NIK.
 * Body: { nik: "NIK baru" }
 */
export async function editNikWargaController(req, res) {
    const { id } = req.params
    const { nik } = req.body
    console.log(`[Request Edit NIK Warga] targetId: ${id}, byUserId: ${req.user.id}`)

    if (!nik) {
        return res.status(400).json({ pesan: "NIK baru wajib diisi masbro!" })
    }

    try {
        // 1. Cek apakah warga dengan ID ini ada
        const warga = await getWargaById(id)
        if (!warga || (typeof warga === "string" && warga.startsWith("error"))) {
            console.log(`[Response Edit NIK Warga] Gagal: Warga id ${id} tidak ditemukan`)
            return res.status(404).json({ pesan: "Data warga tidak ditemukan" })
        }

        // 2. Enkripsi NIK baru
        const encryptedNik = encryptEmails(String(nik))

        // 3. Update NIK di database
        const result = await updateWargaNik(id, encryptedNik)
        if (typeof result === "string" && result.startsWith("error")) {
            return res.status(400).json({ pesan: result })
        }

        console.log(`[Response Edit NIK Warga] Sukses: NIK warga id ${id} berhasil diubah`)
        emitSyncEvent("warga")
        return responseSucces(200, { wargaId: Number(id) }, "NIK warga berhasil diperbarui masbro!", res)
    } catch (err) {
        console.log(`[Error Edit NIK Warga]:`, err)
        return res.status(500).json({ pesan: "error mas di controller editNikWargaController: " + err })
    }
}

/**
 * Edit No KK (Kartu Keluarga) berdasarkan ID family.
 * Hanya RT & Sekretaris yang boleh mengubah No KK.
 * Body: { noKK: "No KK baru" }
 */
export async function editNoKkController(req, res) {
    const { id } = req.params
    const { noKK, no_kk, nokk } = req.body
    const targetNoKk = noKK || no_kk || nokk
    console.log(`[Request Edit No KK] targetFamilyId: ${id}, byUserId: ${req.user.id}`)

    if (!targetNoKk) {
        return res.status(400).json({ pesan: "No KK baru wajib diisi masbro!" })
    }

    try {
        // 1. Cek apakah family/KK dengan ID ini ada
        const family = await getFamilyById(id)
        if (!family || (typeof family === "string" && family.startsWith("error"))) {
            console.log(`[Response Edit No KK] Gagal: Family id ${id} tidak ditemukan`)
            return res.status(404).json({ pesan: "Data KK tidak ditemukan" })
        }

        // 2. Enkripsi No KK baru
        const encryptedNoKk = encryptEmails(String(targetNoKk))

        // 3. Update No KK di database
        const result = await updateFamilyNoKk(id, encryptedNoKk)
        if (typeof result === "string" && result.startsWith("error")) {
            return res.status(400).json({ pesan: result })
        }

        console.log(`[Response Edit No KK] Sukses: No KK family id ${id} berhasil diubah`)
        emitSyncEvent("warga")
        return responseSucces(200, { familyId: Number(id) }, "No KK berhasil diperbarui masbro!", res)
    } catch (err) {
        console.log(`[Error Edit No KK]:`, err)
        return res.status(500).json({ pesan: "error mas di controller editNoKkController: " + err })
    }
}

/**
 * Controller untuk mengambil daftar nama dan ID Kepala Keluarga (KK).
 * Format output: [{ id: 1, family_id: 1, warga_id: 5, nama: "Budi Santoso" }, ...]
 */
export async function getKepalaKeluargaController(req, res) {
    console.log("[Request Get Kepala Keluarga List]")
    try {
        const list = await getKepalaKeluargaList()
        if (typeof list === "string" && list.startsWith("error")) {
            return res.status(400).json({ pesan: list })
        }
        console.log(`[Response Get Kepala Keluarga List] count: ${Array.isArray(list) ? list.length : 0}`)
        return res.json(list)
    } catch (err) {
        console.log("[Error Get Kepala Keluarga List]:", err)
        return res.status(500).json({ pesan: "error mas di controller getKepalaKeluargaController: " + err })
    }
}
