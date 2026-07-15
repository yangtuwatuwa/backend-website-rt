import { addAgenda, listAllAgendas, editAgenda, removeAgenda } from "../services/agenda.js"
import { responseSucces } from "../utils/response.js"

export async function createAgendaController(req, res) {
    const { kategori, judul, deskripsi, tanggal, waktu, tempat } = req.body
    console.log(`[Request Create Agenda] kategori: ${kategori}, judul: ${judul}, tanggal: ${tanggal}, waktu: ${waktu}, tempat: ${tempat}`)
    try {
        const hasilnya = await addAgenda(kategori, judul, deskripsi, tanggal, waktu, tempat)
        console.log("[Response Create Agenda] hasil:", hasilnya)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        return responseSucces(200, hasilnya, "agenda kegiatan berhasil dibuat masbro", res)
    } catch (err) {
        console.log("[Error Create Agenda]:", err)
        return res.status(500).json("salah dibagian controller createAgendaController: " + err)
    }
}

export async function getAgendasController(req, res) {
    const { search } = req.query
    console.log(`[Request Get Agendas] search: ${search || ""}`)
    try {
        const hasilnya = await listAllAgendas(search)
        console.log(`[Response Get Agendas] count: ${Array.isArray(hasilnya) ? hasilnya.length : 0}`)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        return res.json(hasilnya)
    } catch (err) {
        console.log("[Error Get Agendas]:", err)
        return res.status(500).json("salah dibagian controller getAgendasController: " + err)
    }
}

export async function editAgendaController(req, res) {
    const { id } = req.params
    const { kategori, judul, deskripsi, tanggal, waktu, tempat } = req.body
    console.log(`[Request Edit Agenda] id: ${id}, body:`, req.body)
    try {
        const hasilnya = await editAgenda(id, { kategori, judul, deskripsi, tanggal, waktu, tempat })
        console.log("[Response Edit Agenda] hasil:", hasilnya)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        return responseSucces(200, hasilnya, "agenda kegiatan berhasil diperbarui masbro", res)
    } catch (err) {
        console.log("[Error Edit Agenda]:", err)
        return res.status(500).json("salah dibagian controller editAgendaController: " + err)
    }
}

export async function removeAgendaController(req, res) {
    const { id } = req.params
    console.log(`[Request Remove Agenda] id: ${id}`)
    try {
        const hasilnya = await removeAgenda(id)
        console.log("[Response Remove Agenda] hasil:", hasilnya)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        return responseSucces(200, hasilnya, "agenda kegiatan berhasil dihapus masbro", res)
    } catch (err) {
        console.log("[Error Remove Agenda]:", err)
        return res.status(500).json("salah dibagian controller removeAgendaController: " + err)
    }
}
