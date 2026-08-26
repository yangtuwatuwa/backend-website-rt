// TODO: JALUR DARURAT SEMENTARA
// Endpoint ini dibuat untuk inisialisasi / debug pendaftaran akun RT darurat karena panel Admin belum dibangun.
// Hapus/nonaktifkan endpoint ini setelah panel Admin selesai dibangun.

import { register } from "../services/bisnisRegisterAndLogin.js";

export async function debugRegistController(req, res) {
    const { username, password, email, role, family_id, familyId } = req.body;
    
    // Sanitasi: jika role adalah staff pengurus (rt, sekertaris, bendahara, admin), paksa family_id = NULL
    const isStaffRole = ["admin", "rt", "sekertaris", "sekretaris", "bendahara"].includes(String(role).toLowerCase());
    const targetFamilyId = isStaffRole ? null : (family_id || familyId || null);
    
    console.log(`[Request Debug Register] username: ${username}, email: ${email}, role: ${role}, familyId: ${targetFamilyId}`);

    if (!username || !password || !email || !role) {
        return res.status(400).json({ pesan: "payload debug register tidak lengkap" });
    }

    const hasilnya = await register(username, password, email, role, targetFamilyId);
    console.log(`[Response Debug Register] hasil:`, hasilnya);

    if (typeof hasilnya === "string" && (hasilnya.startsWith("error") || hasilnya.startsWith("Error"))) {
        return res.status(400).json({ success: false, pesan: hasilnya });
    }
    if (hasilnya && typeof hasilnya === "object" && hasilnya.success === false) {
        return res.status(400).json({ success: false, pesan: hasilnya.message || "Gagal debug registrasi" });
    }
    return res.status(201).json(hasilnya);
}
