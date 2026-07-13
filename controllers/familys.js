import getsfamily from "../services/getsfamily.js"
import { changePasswordService } from "../services/changePassword.js"
import { getAccountById } from "../models/login.js"

export default async function hasilnya(req, res) {
    const id = req.params.id
    try {
        // Validasi kepemilikan data warga: Warga biasa cuma boleh lihat data keluarganya sendiri
        if (req.user.role === 'warga') {
            const dataUser = await getAccountById(req.user.id)
            if (dataUser === "error" || dataUser.length === 0) {
                return res.status(404).json({ pesan: "Akun tidak ditemukan mas" })
            }
            
            const userFamilyId = dataUser[0].family_id
            if (String(userFamilyId) !== String(id)) {
                return res.status(403).json({ pesan: "Akses ditolak, ini bukan data keluarga lu cuy!" })
            }
        }

        const gettingfamily = await getsfamily(id)
        if (typeof gettingfamily === "string" && gettingfamily.startsWith("error")) {
            return res.status(400).json({ pesan: gettingfamily })
        }
        return res.json(gettingfamily)
    } catch (err) {
        console.log(err)
        return res.status(500).json({ pesan: "error mas di controller: " + err })
    }
}

export async function changePasswordController(req, res) {
    const { newPassword } = req.body;
    const userId = req.user.id; // Diambil dari JWT token

    try {
        const hasilnya = await changePasswordService(userId, newPassword);
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya });
        }
        return res.json({ pesan: "Password berhasil diperbarui masbro!" });
    } catch (err) {
        console.log(err);
        return res.status(500).json({ pesan: "error mas di controller: " + err });
    }
}