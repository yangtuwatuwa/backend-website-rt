import fs from "fs"
import path from "path"
import { responseSucces } from "../utils/response.js"
import { emitSyncEvent } from "../utils/socket.js"
import { inspectArchiveMedia } from "../utils/archiveMedia.js"
import {
    createArchiveMedia,
    deleteArchiveMedia,
    getArchiveMediaById,
    listArchiveMedia
} from "../models/archiveMedia.js"

const ARCHIVE_DIR = path.resolve("./uploads/arsip")
const MAX_PUBLIC_ARCHIVE_ITEMS = 6

function removeUploadedFile(file) {
    if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path)
}

function archiveFilePath(filename) {
    // Hanya nama file yang disimpan; basename mencegah path traversal jika data DB rusak.
    return path.join(ARCHIVE_DIR, path.basename(filename))
}

export async function uploadArchiveMediaController(req, res) {
    const file = req.file
    const judul = typeof req.body.judul === "string" ? req.body.judul.trim() : ""
    const kategori = typeof req.body.kategori === "string" ? req.body.kategori.trim() : ""

    if (!file) return res.status(400).json({ pesan: "Pilih foto atau video yang akan diarsipkan." })
    if (!judul || judul.length > 200) {
        removeUploadedFile(file)
        return res.status(400).json({ pesan: "Judul wajib diisi dan maksimal 200 karakter." })
    }
    if (!kategori || kategori.length > 100) {
        removeUploadedFile(file)
        return res.status(400).json({ pesan: "Kategori wajib diisi dan maksimal 100 karakter." })
    }

    try {
        const inspected = await inspectArchiveMedia(file.path, file.size)
        const result = await createArchiveMedia({
            judul,
            kategori,
            ...inspected,
            filePath: file.filename,
            originalName: file.originalname.slice(0, 255),
            fileSize: file.size,
            uploadedBy: req.user?.id
        })
        const item = {
            id: result.insertId,
            judul,
            kategori,
            media_type: inspected.mediaType,
            mime_type: inspected.mimeType,
            file_size: file.size,
            media_url: `/post/arsip-media/${result.insertId}/file`
        }

        emitSyncEvent("archive_media")
        res.status(201)
        return responseSucces(201, item, "Arsip foto/video berhasil diunggah.", res)
    } catch (err) {
        removeUploadedFile(file)
        const isValidationError = err.message?.includes("maksimal") ||
            err.message?.includes("tidak dikenali") || err.message?.includes("tidak didukung")
        return res.status(isValidationError ? 400 : 500).json({
            pesan: isValidationError ? err.message : "Gagal menyimpan arsip media."
        })
    }
}

export async function getPublicArchiveMediaController(req, res) {
    const parsedPage = Number.parseInt(req.query.page, 10)
    const parsedLimit = Number.parseInt(req.query.limit, 10)
    const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1
    const limit = Number.isInteger(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, MAX_PUBLIC_ARCHIVE_ITEMS)
        : MAX_PUBLIC_ARCHIVE_ITEMS
    const kategori = typeof req.query.kategori === "string" ? req.query.kategori.trim().slice(0, 100) : ""
    const mediaType = ["image", "video"].includes(req.query.media_type) ? req.query.media_type : ""

    try {
        const { rows, total } = await listArchiveMedia({ page, limit, kategori, mediaType })
        const items = rows.map(item => ({
            ...item,
            media_url: `/post/arsip-media/${item.id}/file`
        }))
        return responseSucces(200, {
            items,
            pagination: { page, limit, total, total_pages: Math.ceil(total / limit) }
        }, "Daftar arsip publik berhasil diambil.", res)
    } catch (err) {
        return res.status(500).json({ pesan: "Gagal mengambil daftar arsip media." })
    }
}

export async function streamPublicArchiveMediaController(req, res) {
    try {
        const item = await getArchiveMediaById(req.params.id)
        if (!item) return res.status(404).json({ pesan: "Arsip media tidak ditemukan." })

        const filePath = archiveFilePath(item.file_path)
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ pesan: "File arsip tidak ditemukan di server." })
        }

        const { size } = fs.statSync(filePath)
        const range = req.headers.range
        res.setHeader("Content-Type", item.mime_type)
        res.setHeader("Accept-Ranges", "bytes")
        res.setHeader("Cache-Control", "public, max-age=86400")
        res.setHeader("Content-Disposition", `inline; filename="arsip-${item.id}"`)

        if (!range) {
            res.setHeader("Content-Length", size)
            return fs.createReadStream(filePath).pipe(res)
        }

        const match = /^bytes=(\d*)-(\d*)$/.exec(range)
        if (!match) {
            res.setHeader("Content-Range", `bytes */${size}`)
            return res.status(416).end()
        }

        let start = match[1] ? Number(match[1]) : 0
        let end = match[2] ? Number(match[2]) : size - 1
        if (!match[1] && match[2]) {
            const suffixLength = Number(match[2])
            start = Math.max(size - suffixLength, 0)
            end = size - 1
        }
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
            res.setHeader("Content-Range", `bytes */${size}`)
            return res.status(416).end()
        }
        end = Math.min(end, size - 1)

        res.status(206)
        res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`)
        res.setHeader("Content-Length", end - start + 1)
        return fs.createReadStream(filePath, { start, end }).pipe(res)
    } catch (err) {
        return res.status(500).json({ pesan: "Gagal menampilkan arsip media." })
    }
}

export async function deleteArchiveMediaController(req, res) {
    try {
        const item = await getArchiveMediaById(req.params.id)
        if (!item) return res.status(404).json({ pesan: "Arsip media tidak ditemukan." })

        await deleteArchiveMedia(item.id)
        const filePath = archiveFilePath(item.file_path)
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
        emitSyncEvent("archive_media")
        return responseSucces(200, { id: item.id }, "Arsip media berhasil dihapus.", res)
    } catch (err) {
        return res.status(500).json({ pesan: "Gagal menghapus arsip media." })
    }
}
