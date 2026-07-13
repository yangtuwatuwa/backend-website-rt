import { warganyain, listWarga, listPendingWarga, verifyWarga, updateWargaService } from "../services/inputdbwarga.js"
import {logicWarganya, listWarganya} from "../services/inputDataWarga.js"
import { responseSucces } from "../utils/response.js"
import editResident from "../services/editedResident.js"
import { inputWarga, listRumah } from "../services/inputHouse.js"
import { generateWargaAccount, generateStaffAccount } from "../services/createAccount.js"
import { getAccountById } from "../models/login.js"
import { getWargaById } from "../models/inputwarganya.js"
import { getFamilyById } from "../models/resident.js"
import { decryptEmails } from "../helpers/ciihper.js"
import { argonverify } from "../helpers/argon2.js"
import { createDocument, getDocumentById } from "../models/document.js"
import fs from "fs"
import path from "path"
import { getHouseById } from "../models/houseWarga.js"
export async function inputData(req,res){
   const {noKK , home , KepalaKeluarga} = req.body
   
    try {
        const warga = await logicWarganya(noKK ,home , KepalaKeluarga)
        if (typeof warga === "string" && warga.startsWith("error")) {
            return res.status(400).json(warga)
        }
        return responseSucces(200 , warga , "masuk dengan sempurna " , res)
    } catch (err) {
        console.log("err mas")
        return res.status(500).json("error mas di controllers: " + err)
    }
    
}

export async function getResident(req,res){
    try {
        const warga = await listWarganya()
        if (typeof warga === "string" && warga.startsWith("error")) {
            return res.status(400).json(warga)
        }
        return res.json(warga)
    } catch (err) {
        console.log("err mas")
        return res.status(500).json("error mas di controllers: " + err)
    }
}

export async function editedResident(req,res) {
    const { id } = req.params;
    const { noKK } = req.body;
    
    try {
        const warga = await editResident(id, noKK)
        if (typeof warga === "string" && (warga.startsWith("salah") || warga.startsWith("error"))) {
            return res.status(400).json(warga)
        }
        return responseSucces(200 , warga , "Berhasil mengubah data warga", res )
    } catch (err) {
        console.log("err mas")
        return res.status(500).json("error mas di controllers: " + err)
    }
}   


    export async function inputHouse(req,res) {
            const {blok , nomor , alamat, status } = req.body
            try {
                const hasilnya = await inputWarga(blok, nomor, alamat, status) 
                if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
                    return res.status(400).json(hasilnya)
                }
                return responseSucces (200, hasilnya , "data nya sudah terkirim " , res)
            } catch (error) {
                console.log(error)
                return res.status(500).json("data tidak terkirim " + error)
            }
    }

    export async function warga(req,res ) {
        const{nik , nama , jenisKelamin , tglLahir , statusHidup , noHp , umur , fammilyId, houseId} = req.body
        try {
            const hasilnya = await warganyain(nik, nama, jenisKelamin, tglLahir, statusHidup, noHp, umur, fammilyId, houseId) 
            if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
                return res.status(400).json(hasilnya)
            }
            return responseSucces(200 , hasilnya , "masuk dengan sempurnaaa" , res)      
        } catch (err) {
            console.log(err)
            return res.status(500).json("salah dibagian warga controller: "+ err)
        }
    }

    export async function getHouse(req, res) {
        try {
            const rumah = await listRumah()
            if (typeof rumah === "string" && rumah.startsWith("error")) {
                return res.status(400).json(rumah)
            }
            return res.json(rumah)
        } catch (err) {
            console.log("err mas")
            return res.status(500).json("error mas di controllers: " + err)
        }
    }

    export async function getWarga(req, res) {
        try {
            const warga = await listWarga()
            if (typeof warga === "string" && warga.startsWith("error")) {
                return res.status(400).json(warga)
            }
            return res.json(warga)
        } catch (err) {
            console.log("err mas")
            return res.status(500).json("error mas di controllers: " + err)
        }
    }

    export async function revealWarga(req, res) {
        const { id } = req.params
        const { password } = req.body
        const userId = req.user.id

        try {
            const dataUser = await getAccountById(userId)
            if (dataUser === "error" || dataUser.length === 0) {
                return res.status(404).json({ pesan: "Akun tidak ditemukan mas" })
            }

            const match = await argonverify(dataUser[0].password, password)
            if (!match) {
                return res.status(401).json({ pesan: "Password verifikasi salah, cuy!" })
            }

            const warga = await getWargaById(id)
            if (!warga || (typeof warga === "string" && warga.startsWith("error"))) {
                return res.status(404).json({ pesan: "Data warga tidak ditemukan" })
            }

            const nikAsli = decryptEmails(warga.nik)
            return res.json({ nik: nikAsli })

        } catch (err) {
            console.log(err)
            return res.status(500).json({ pesan: "error mas di controller revealWarga: " + err })
        }
    }

    export async function revealFamily(req, res) {
        const { id } = req.params
        const { password } = req.body
        const userId = req.user.id

        try {
            const dataUser = await getAccountById(userId)
            if (dataUser === "error" || dataUser.length === 0) {
                return res.status(404).json({ pesan: "Akun tidak ditemukan mas" })
            }

            const match = await argonverify(dataUser[0].password, password)
            if (!match) {
                return res.status(401).json({ pesan: "Password verifikasi salah, cuy!" })
            }

            const family = await getFamilyById(id)
            if (!family || (typeof family === "string" && family.startsWith("error"))) {
                return res.status(404).json({ pesan: "Data KK tidak ditemukan" })
            }

            const kkAsli = decryptEmails(family.no_kk)
            return res.json({ no_kk: kkAsli })

        } catch (err) {
            console.log(err)
            return res.status(500).json({ pesan: "error mas di controller revealFamily: " + err })
        }
    }

    export async function createWargaAccountController(req, res) {
        const { familyId } = req.body;
        try {
            const account = await generateWargaAccount(familyId);
            if (typeof account === "string" && account.startsWith("error")) {
                return res.status(400).json({ pesan: account });
            }
            return responseSucces(200, account, "Akun berhasil dibuat", res);
        } catch (err) {
            console.log(err);
            return res.status(500).json({ pesan: "error mas di controller: " + err });
        }
    }

    export async function createWargaByResident(req, res) {
        const { nik, nama, jenisKelamin, tglLahir, statusHidup, noHp, umur } = req.body
        const userId = req.user.id
        try {
            const dataUser = await getAccountById(userId)
            if (!dataUser || dataUser === "error" || dataUser.length === 0) {
                return res.status(404).json({ pesan: "Akun tidak ditemukan mas" })
            }
            
            const familyId = dataUser[0].family_id
            if (!familyId) {
                return res.status(400).json({ pesan: "Akun anda belum terikat dengan KK mana pun" })
            }
            
            const familyData = await getFamilyById(familyId)
            if (!familyData || (typeof familyData === "string" && familyData.startsWith("error"))) {
                return res.status(404).json({ pesan: "Data KK keluarga tidak ditemukan" })
            }
            
                        const houseId = familyData.house_id
            
            const hasilnya = await warganyain(nik, nama, jenisKelamin, tglLahir, statusHidup, noHp, umur, familyId, houseId, "diterima")
            if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
                return res.status(400).json({ pesan: hasilnya })
            }
            return responseSucces(200, hasilnya, "pendaftaran anggota keluarga berhasil, data langsung aktif masbro!", res)
        } catch (err) {
            console.log(err)
            return res.status(500).json({ pesan: "salah dibagian controller createWargaByResident: " + err })
        }
    }

    export async function getPendingWargaController(req, res) {
        try {
            const warga = await listPendingWarga()
            if (typeof warga === "string" && warga.startsWith("error")) {
                return res.status(400).json({ pesan: warga })
            }
            return res.json(warga)
        } catch (err) {
            console.log(err)
            return res.status(500).json({ pesan: "error mas di controller getPendingWargaController: " + err })
        }
    }

    export async function verifyWargaController(req, res) {
        const { id } = req.params
        const { status } = req.body
        try {
            const hasilnya = await verifyWarga(id, status)
            if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
                return res.status(400).json({ pesan: hasilnya })
            }
            return responseSucces(200, hasilnya, "verifikasi status warga berhasil diupdate", res)
        } catch (err) {
            console.log(err)
            return res.status(500).json({ pesan: "salah dibagian controller verifyWargaController: " + err })
        }
    }

    export async function uploadSensitifDataController(req, res) {
        const { id } = req.params
        const { type } = req.body
        const userId = req.user.id
        const file = req.file

        if (!file) {
            return res.status(400).json({ pesan: "Pilih file yang mau diupload dulu, cuy!" })
        }

        const allowedTypes = ["kk", "ktp", "akta", "kia", "foto"]
        if (!type || !allowedTypes.includes(type)) {
            if (file.path && fs.existsSync(file.path)) {
                fs.unlinkSync(file.path)
            }
            return res.status(400).json({ pesan: "Tipe dokumen tidak valid! Pilih antara kk, ktp, akta, kia, atau foto." })
        }

        try {
            const dataUser = await getAccountById(userId)
            if (!dataUser || dataUser === "error" || dataUser.length === 0) {
                if (fs.existsSync(file.path)) fs.unlinkSync(file.path)
                return res.status(404).json({ pesan: "Akun tidak ditemukan mas" })
            }

            const warga = await getWargaById(id)
            if (!warga || (typeof warga === "string" && warga.startsWith("error"))) {
                if (fs.existsSync(file.path)) fs.unlinkSync(file.path)
                return res.status(404).json({ pesan: "Data warga tidak ditemukan" })
            }

            if (req.user.role === "warga") {
                const userFamilyId = dataUser[0].family_id
                if (String(userFamilyId) !== String(warga.family_id)) {
                    if (fs.existsSync(file.path)) fs.unlinkSync(file.path)
                    return res.status(403).json({ pesan: "Akses ditolak, ini bukan data keluarga lu cuy!" })
                }

                // Ambil data KK dan Rumah untuk memvalidasi status kepemilikan
                const family = await getFamilyById(warga.family_id)
                if (!family || (typeof family === "string" && family.startsWith("error"))) {
                    if (fs.existsSync(file.path)) fs.unlinkSync(file.path)
                    return res.status(404).json({ pesan: "Data KK keluarga tidak ditemukan masbro" })
                }

                const house = await getHouseById(family.house_id)
                if (!house || (typeof house === "string" && house.startsWith("error"))) {
                    if (fs.existsSync(file.path)) fs.unlinkSync(file.path)
                    return res.status(404).json({ pesan: "Data rumah keluarga tidak ditemukan masbro" })
                }

                // Warga dengan status kontrak ditolak melakukan upload mandiri
                if (house.status === "kontrak") {
                    if (fs.existsSync(file.path)) fs.unlinkSync(file.path)
                    return res.status(403).json({ pesan: "Akses ditolak, warga dengan status kontrak tidak diizinkan mengupload berkas sensitif mandiri!" })
                }
            }

            const results = await createDocument(warga.family_id, id, type, file.filename)
            if (typeof results === "string" && results.startsWith("error")) {
                if (fs.existsSync(file.path)) fs.unlinkSync(file.path)
                return res.status(400).json({ pesan: results })
            }

            return responseSucces(200, { document_id: results.insertId, file_path: file.filename }, "Upload file sensitif berhasil masbro!", res)
        } catch (err) {
            console.log(err)
            if (file && file.path && fs.existsSync(file.path)) {
                fs.unlinkSync(file.path)
            }
            return res.status(500).json({ pesan: "error mas di controller uploadSensitifDataController: " + err })
        }
    }

    export async function downloadSensitifFileController(req, res) {
        const { document_id } = req.params
        const userId = req.user.id

        try {
            const dataUser = await getAccountById(userId)
            if (!dataUser || dataUser === "error" || dataUser.length === 0) {
                return res.status(404).json({ pesan: "Akun tidak ditemukan mas" })
            }

            const document = await getDocumentById(document_id)
            if (!document || (typeof document === "string" && document.startsWith("error"))) {
                return res.status(404).json({ pesan: "Dokumen tidak ditemukan, cuy!" })
            }

            if (req.user.role === "warga") {
                const userFamilyId = dataUser[0].family_id
                if (String(userFamilyId) !== String(document.family_id)) {
                    return res.status(403).json({ pesan: "Akses ditolak, ini bukan data keluarga lu cuy!" })
                }
            }

            const filePath = path.resolve("./secure_uploads", document.file_path)
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ pesan: "File fisik dokumen tidak ditemukan di server, masbro" })
            }

            return res.sendFile(filePath)
        } catch (err) {
            console.log(err)
            return res.status(500).json({ pesan: "error mas di controller downloadSensitifFileController: " + err })
        }
    }

    export async function createStaffAccountController(req, res) {
        const { username, password, email, role } = req.body
        
        const allowedStaffRoles = ["sekertaris", "sekretaris", "bendahara"]
        if (!role || !allowedStaffRoles.includes(role)) {
            return res.status(400).json({ pesan: "Role staff tidak valid masbro! Cuma boleh sekertaris atau bendahara." })
        }

        const mappedRole = (role === "sekretaris") ? "sekertaris" : role

        try {
            const account = await generateStaffAccount(username, password, email, mappedRole)
            if (typeof account === "string" && account.startsWith("error")) {
                return res.status(400).json({ pesan: account })
            }
            return responseSucces(200, account, "Akun staff berhasil dibuat masbro", res)
        } catch (err) {
            console.log(err)
            return res.status(500).json({ pesan: "error mas di controller: " + err })
        }
    }

    export async function updateWargaDetailsController(req, res) {
        const { id } = req.params
        const { nama, jenisKelamin, tglLahir, statusHidup, noHp, umur } = req.body
        const userId = req.user.id

        try {
            const dataUser = await getAccountById(userId)
            if (!dataUser || dataUser === "error" || dataUser.length === 0) {
                return res.status(404).json({ pesan: "Akun tidak ditemukan mas" })
            }

            const warga = await getWargaById(id)
            if (!warga || (typeof warga === "string" && warga.startsWith("error"))) {
                return res.status(404).json({ pesan: "Data warga tidak ditemukan" })
            }

            const userRole = req.user.role
            if (userRole === "bendahara") {
                return res.status(403).json({ pesan: "Akses ditolak, bendahara tidak diizinkan mengubah data warga!" })
            }

            if (userRole === "warga") {
                const userFamilyId = dataUser[0].family_id
                if (String(userFamilyId) !== String(warga.family_id)) {
                    return res.status(403).json({ pesan: "Akses ditolak, ini bukan data keluarga lu cuy!" })
                }
            }

            const dataToUpdate = { nama, jenisKelamin, tglLahir, statusHidup, noHp, umur }
            Object.keys(dataToUpdate).forEach(key => dataToUpdate[key] === undefined && delete dataToUpdate[key])

            if (Object.keys(dataToUpdate).length === 0) {
                return res.status(400).json({ pesan: "Kirim data yang mau di-update dong masbro!" })
            }

            const hasilnya = await updateWargaService(id, dataToUpdate)
            if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
                return res.status(400).json({ pesan: hasilnya })
            }

            return responseSucces(200, hasilnya, "Data warga berhasil diperbarui cuy!", res)
        } catch (err) {
            console.log(err)
            return res.status(500).json({ pesan: "error mas di controller updateWargaDetailsController: " + err })
        }
    }