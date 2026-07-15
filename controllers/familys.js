import getsfamily from "../services/getsfamily.js"
import { changePasswordService } from "../services/changePassword.js"
import { getAccountById } from "../models/login.js"

export default async function hasilnya(req, res) {
    const id = req.params.id
    console.log(`[Request Get Family] familyId: ${id}, userRole: ${req.user?.role}, userId: ${req.user?.id}`)
    try {
        // Validasi kepemilikan data warga: Warga biasa cuma boleh lihat data keluarganya sendiri
        if (req.user.role === 'warga') {
            const dataUser = await getAccountById(req.user.id)
            if (dataUser === "error" || dataUser.length === 0) {
                console.log(`[Response Get Family] Akun tidak ditemukan untuk userId: ${req.user.id}`)
                return res.status(404).json({ pesan: "Akun tidak ditemukan mas" })
            }
            
            const userFamilyId = dataUser[0].family_id
            if (String(userFamilyId) !== String(id)) {
                console.log(`[Response Get Family] Akses ditolak: User family_id (${userFamilyId}) berbeda dengan target id (${id})`)
                return res.status(403).json({ pesan: "Akses ditolak, ini bukan data keluarga lu cuy!" })
            }
        }

        const gettingfamily = await getsfamily(id)
        console.log(`[Response Get Family] hasil:`, gettingfamily)
        if (typeof gettingfamily === "string" && gettingfamily.startsWith("error")) {
            return res.status(400).json({ pesan: gettingfamily })
        }
        return res.json(gettingfamily)
    } catch (err) {
        console.log(`[Error Get Family]:`, err)
        return res.status(500).json({ pesan: "error mas di controller: " + err })
    }
}

export async function changePasswordController(req, res) {
    const { newPassword } = req.body;
    const userId = req.user.id; // Diambil dari JWT token
    console.log(`[Request Change Password] userId: ${userId}`)

    try {
        const hasilnya = await changePasswordService(userId, newPassword);
        console.log(`[Response Change Password] hasil:`, hasilnya)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya });
        }
        return res.json({ pesan: "Password berhasil diperbarui masbro!" });
    } catch (err) {
        console.log(`[Error Change Password]:`, err);
        return res.status(500).json({ pesan: "error mas di controller: " + err });
    }
}