import { listKaryawan, castVote, listVoteResults } from "../services/karyawan.js"
import { responseSucces } from "../utils/response.js"
import { emitSyncEvent } from "../utils/socket.js"

export async function getKaryawanListController(req, res) {
    console.log("[Request List Karyawan]")
    try {
        const hasilnya = await listKaryawan()
        console.log("[Response List Karyawan] hasil:", hasilnya)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        return res.json(hasilnya)
    } catch (err) {
        console.log("[Error List Karyawan]:", err)
        return res.status(500).json("salah dibagian controller getKaryawanListController: " + err)
    }
}

export async function postVoteController(req, res) {
    const { karyawanId } = req.body
    const accountId = req.user.id
    console.log(`[Request Vote Karyawan] accountId: ${accountId}, karyawanId: ${karyawanId}`)

    if (!karyawanId) {
        console.log("[Response Vote Karyawan] hasil: error karena karyawanId kosong")
        return res.status(400).json({ pesan: "error: karyawanId wajib diisi masbro!" })
    }

    try {
        const hasilnya = await castVote(accountId, karyawanId)
        console.log("[Response Vote Karyawan] hasil:", hasilnya)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        emitSyncEvent("vote")
        return responseSucces(200, hasilnya, "Vote lu berhasil dimasukkan masbro, mantap!", res)
    } catch (err) {
        console.log("[Error Vote Karyawan]:", err)
        return res.status(500).json("salah dibagian controller postVoteController: " + err)
    }
}

export async function getVoteResultsController(req, res) {
    console.log("[Request Hasil Vote]")
    try {
        const hasilnya = await listVoteResults()
        console.log("[Response Hasil Vote] hasil:", hasilnya)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        return res.json(hasilnya)
    } catch (err) {
        console.log("[Error Hasil Vote]:", err)
        return res.status(500).json("salah dibagian controller getVoteResultsController: " + err)
    }
}
