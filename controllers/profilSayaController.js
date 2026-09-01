import { getProfilSayaService } from "../services/profilSayaService.js";

export async function getProfilSayaController(req, res) {
    const userId = req.user.id;
    console.log(`[Request Get Profil Saya] userId: ${userId}`);

    try {
        const profile = await getProfilSayaService(userId);
        if (typeof profile === "string" && profile.startsWith("error")) {
            const notFound = profile.includes("tidak ditemukan") || profile.includes("belum terikat");
            return res.status(notFound ? 404 : 400).json({ pesan: profile });
        }

        return res.status(200).json({
            response: 200,
            output: profile,
            data: profile,
            message: "Data profil saya berhasil diambil"
        });
    } catch (err) {
        console.log("[Error Get Profil Saya]:", err);
        return res.status(500).json({ pesan: "error mas di controller getProfilSayaController: " + err });
    }
}
