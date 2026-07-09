import { warganyain, listWarga } from "../services/inputdbwarga.js"
import {logicWarganya, listWarganya} from "../services/inputDataWarga.js"
import { responseSucces } from "../utils/response.js"
import editResident from "../services/editedResident.js"
import { inputWarga, listRumah } from "../services/inputHouse.js"
import { getAccountById } from "../models/login.js"
import { getWargaById } from "../models/inputwarganya.js"
import { getFamilyById } from "../models/resident.js"
import { decryptEmails } from "../helpers/ciihper.js"
import { argonverify } from "../helpers/argon2.js"
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