import { registerFamilyService } from "../services/familyRegistrationService.js"
import { registerResidentOnlyService } from "../services/registerResidentOnlyService.js"
import { responseSucces } from "../utils/response.js"
import { emitSyncEvent } from "../utils/socket.js"

export async function registerFamilyController(req, res) {
    console.log("[Request Register Family] body:", req.body)

    // Bersahabat dengan format structured maupun flat body dari frontend
    const houseData = req.body.house || {
        houseId: req.body.houseId || req.body.house_id,
        blok: req.body.blok,
        nomor: req.body.nomor,
        alamat: req.body.alamat,
        status: req.body.statusRumah ?? req.body.status ?? "pribadi"
    }

    const familyData = req.body.family || {
        noKK: req.body.noKK || req.body.no_kk || req.body.nokk
    }

    const rawHead = req.body.kepalaKeluarga || {}
    const headOfFamilyData = {
        nik: rawHead.nik || req.body.nik,
        nama: rawHead.nama || req.body.nama,
        jenisKelamin: rawHead.jenisKelamin || req.body.jenisKelamin,
        tglLahir: rawHead.tglLahir || req.body.tglLahir,
        statusHidup: rawHead.statusHidup || req.body.statusHidup || "Hidup",
        noHp: rawHead.noHp || req.body.noHp,
        umur: rawHead.umur !== undefined ? rawHead.umur : req.body.umur,
        email: rawHead.email || req.body.email
    }

    const accountData = {
        username: req.body.username || rawHead.username,
        password: req.body.password || rawHead.password,
        email: req.body.email || rawHead.email
    }

    try {
        const hasilnya = await registerFamilyService(houseData, familyData, headOfFamilyData, accountData)
        console.log("[Response Register Family] hasil:", hasilnya)

        if (typeof hasilnya === "string" && (hasilnya.startsWith("error") || hasilnya.startsWith("Error"))) {
            return res.status(400).json({ pesan: hasilnya })
        }

        emitSyncEvent("warga")

        return responseSucces(200, hasilnya, "Pendaftaran kepala keluarga dan pembuatan akun berhasil dilakukan secara otomatis!", res)
    } catch (err) {
        console.log("[Error Register Family]:", err)
        return res.status(500).json({ pesan: "salah dibagian controller registerFamilyController: " + (err.message || err) })
    }
}

export async function registerResidentOnlyController(req, res) {
    console.log("[Request Register Resident Only] body:", req.body)

    const houseData = req.body.house || {
        houseId: req.body.houseId || req.body.house_id,
        blok: req.body.blok,
        nomor: req.body.nomor,
        alamat: req.body.alamat,
        status: req.body.statusRumah ?? req.body.status ?? "pribadi"
    }

    const familyData = req.body.family || {
        noKK: req.body.noKK || req.body.no_kk || req.body.nokk
    }

    const wargaData = req.body.warga || req.body

    try {
        const result = await registerResidentOnlyService(houseData, familyData, wargaData)
        console.log("[Response Register Resident Only] sukses:", result)

        emitSyncEvent("warga")

        return res.status(200).json({
            response: 200,
            output: {
                houseId: result.houseId,
                familyId: result.familyId,
                wargaId: result.wargaId
            },
            message: "Data kependudukan warga berhasil didaftarkan!"
        })
    } catch (err) {
        console.log("[Error Register Resident Only]:", err.message || err)
        return res.status(400).json({
            pesan: err.message || "Gagal mendaftarkan data kependudukan warga",
            message: err.message || "Gagal mendaftarkan data kependudukan warga"
        })
    }
}


