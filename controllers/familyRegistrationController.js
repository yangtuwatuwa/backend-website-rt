import { registerFamilyService } from "../services/familyRegistrationService.js"
import { responseSucces } from "../utils/response.js"

export async function registerFamilyController(req, res) {
    console.log("[Request Register Family] body:", req.body)

    // Bersahabat dengan format structured maupun flat body dari frontend
    const houseData = req.body.house || {
        blok: req.body.blok,
        nomor: req.body.nomor,
        alamat: req.body.alamat,
        status: req.body.statusRumah ?? req.body.status
    }

    const familyData = req.body.family || {
        noKK: req.body.noKK
    }

    const headOfFamilyData = req.body.kepalaKeluarga || {
        nik: req.body.nik,
        nama: req.body.nama,
        jenisKelamin: req.body.jenisKelamin,
        tglLahir: req.body.tglLahir,
        statusHidup: req.body.statusHidup,
        noHp: req.body.noHp,
        umur: req.body.umur
    }

    try {
        const hasilnya = await registerFamilyService(houseData, familyData, headOfFamilyData)
        console.log("[Response Register Family] hasil:", hasilnya)

        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }

        return responseSucces(200, hasilnya, "Pendaftaran kepala keluarga dan pembuatan akun berhasil dilakukan secara otomatis!", res)
    } catch (err) {
        console.log("[Error Register Family]:", err)
        return res.status(500).json("salah dibagian controller registerFamilyController: " + err)
    }
}
