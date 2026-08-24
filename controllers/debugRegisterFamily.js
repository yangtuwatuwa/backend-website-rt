import { registerFamilyService } from "../services/familyRegistrationService.js";
import { responseSucces } from "../utils/response.js";

/**
 * Debug endpoint to register a family and return its IDs.
 * Expected payload (same as admin/register-family) but can be minimal for testing.
 */
export async function debugRegisterFamily(req, res) {
    console.log('[Debug Register Family] body:', req.body);

    // Reuse the same parsing logic as familyRegistrationController
    const houseData = req.body.house || {
        blok: req.body.blok,
        nomor: req.body.nomor,
        alamat: req.body.alamat,
        status: req.body.statusRumah ?? req.body.status,
    };

    const familyData = req.body.family || {
        noKK: req.body.noKK,
    };

    const headOfFamilyData = req.body.kepalaKeluarga || {
        nik: req.body.nik,
        nama: req.body.nama,
        jenisKelamin: req.body.jenisKelamin,
        tglLahir: req.body.tglLahir,
        statusHidup: req.body.statusHidup,
        noHp: req.body.noHp,
        umur: req.body.umur,
    };

    const accountData = {
        username: req.body.username || (req.body.kepalaKeluarga && req.body.kepalaKeluarga.username),
        password: req.body.password || (req.body.kepalaKeluarga && req.body.kepalaKeluarga.password),
        email: req.body.email || (req.body.kepalaKeluarga && req.body.kepalaKeluarga.email)
    };

    try {
        const result = await registerFamilyService(houseData, familyData, headOfFamilyData, accountData);
        console.log('[Debug Register Family] result:', result);
        // result already contains familyId, houseId, kepalaKeluargaId, account info
        return responseSucces(201, result, 'Debug registration successful', res);
    } catch (err) {
        console.error('[Debug Register Family] error:', err);
        return res.status(500).json({ pesan: 'error pada debug register: ' + err.message });
    }
}

