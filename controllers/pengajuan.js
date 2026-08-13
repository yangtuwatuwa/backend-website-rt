import { createPengajuan, listPengajuanWarga, listAllPengajuan, changePengajuanStatus, archivePengajuanService } from "../services/pengajuan.js"
import { responseSucces } from "../utils/response.js"
import { emitSyncEvent } from "../utils/socket.js"

export async function addPengajuan(req, res) {
    const { keperluan, jenis } = req.body
    const userId = req.user.id
    console.log(`[Request Add Pengajuan] userId: ${userId}, jenis: ${jenis}, keperluan: ${keperluan}`)
    try {
        const hasilnya = await createPengajuan(userId, keperluan, jenis)
        console.log(`[Response Add Pengajuan] hasil:`, hasilnya)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        emitSyncEvent("pengajuan")
        return responseSucces(200, hasilnya, "pengajuan berhasil dikirim", res)
    } catch (err) {
        console.log(`[Error Add Pengajuan]:`, err)
        return res.status(500).json("salah dibagian controller addPengajuan: " + err)
    }
}

export async function checkStatusPengajuan(req, res) {
    const userId = req.user.id
    console.log(`[Request Check Status Pengajuan] userId: ${userId}`)
    try {
        const hasilnya = await listPengajuanWarga(userId)
        console.log(`[Response Check Status Pengajuan] count: ${Array.isArray(hasilnya) ? hasilnya.length : 0}`)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        return res.json(hasilnya)
    } catch (err) {
        console.log(`[Error Check Status Pengajuan]:`, err)
        return res.status(500).json("salah dibagian controller checkStatusPengajuan: " + err)
    }
}

export async function reviewPengajuan(req, res) {
    console.log(`[Request Review Pengajuan]`)
    try {
        const hasilnya = await listAllPengajuan()
        console.log(`[Response Review Pengajuan] count: ${Array.isArray(hasilnya) ? hasilnya.length : 0}`)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        return res.json(hasilnya)
    } catch (err) {
        console.log(`[Error Review Pengajuan]:`, err)
        return res.status(500).json("salah dibagian controller reviewPengajuan: " + err)
    }
}

export async function approvePengajuan(req, res) {
    const { id } = req.params
    const { status, is_archived, isArchived, archived } = req.body
    console.log(`[Request Approve Pengajuan] id: ${id}, status: ${status}, is_archived: ${is_archived ?? isArchived ?? archived}`)
    try {
        let hasilnya = null
        if (status) {
            hasilnya = await changePengajuanStatus(id, status)
            if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
                return res.status(400).json({ pesan: hasilnya })
            }
        }

        const targetArchive = is_archived ?? isArchived ?? archived
        if (targetArchive !== undefined) {
            const archiveResult = await archivePengajuanService(id, Boolean(targetArchive))
            if (typeof archiveResult === "string" && archiveResult.startsWith("error")) {
                return res.status(400).json({ pesan: archiveResult })
            }
        }

        emitSyncEvent("pengajuan")
        return responseSucces(200, hasilnya || { success: true }, "pengajuan berhasil diupdate", res)
    } catch (err) {
        console.log(`[Error Approve Pengajuan]:`, err)
        return res.status(500).json("salah dibagian controller approvePengajuan: " + err)
    }
}

export async function archivePengajuanController(req, res) {
    const { id } = req.params
    const { is_archived, isArchived, archived } = req.body
    const targetArchive = (is_archived ?? isArchived ?? archived) !== undefined ? Boolean(is_archived ?? isArchived ?? archived) : true

    console.log(`[Request Archive Pengajuan] id: ${id}, is_archived: ${targetArchive}`)
    try {
        const hasilnya = await archivePengajuanService(id, targetArchive)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return res.status(400).json({ pesan: hasilnya })
        }
        emitSyncEvent("pengajuan")
        return responseSucces(200, hasilnya, `Surat pengajuan berhasil ${targetArchive ? 'dinyatakan selesai/diarsipkan' : 'diaktifkan kembali'}`, res)
    } catch (err) {
        console.log(`[Error Archive Pengajuan]:`, err)
        return res.status(500).json("salah dibagian controller archivePengajuanController: " + err)
    }
}

