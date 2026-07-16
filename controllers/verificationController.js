import { listPendingWarga, verifyWarga } from "../services/inputdbwarga.js"
import { responseSucces } from "../utils/response.js"

export async function getPendingWargaController(req, res) {
    console.log(`[Request Get Pending Warga]`)
    try {
        const warga = await listPendingWarga()
        console.log(`[Response Get Pending Warga] count: ${Array.isArray(warga) ? warga.length : 0}`)
        if (typeof warga === "string" && warga.startsWith("error")) {
            return res.status(400).json({ pesan: warga })
        }
        return res.json(warga)
    } catch (err) {
        console.log(`[Error Get Pending Warga]:`, err)
        return res.status(500).json({ pesan: "error mas di controller getPendingWargaController: " + err })
    }
}

export async function verifyWargaController(req, res) {
    const { id } = req.params
    const { status } = req.body
    console.log(`[Request Verify Warga] id: ${id}, status: ${status}`)
    try {
        const hasilnya = await verifyWarga(id, status)
        console.log(`[Response Verify Warga] hasil:`, hasilnya)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        return responseSucces(200, hasilnya, "verifikasi status warga berhasil diupdate", res)
    } catch (err) {
        console.log(`[Error Verify Warga]:`, err)
        return res.status(500).json({ pesan: "salah dibagian controller verifyWargaController: " + err })
    }
}
