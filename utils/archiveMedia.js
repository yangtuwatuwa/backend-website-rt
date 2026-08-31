import { fileTypeFromFile } from "file-type"

export const ARCHIVE_IMAGE_MIMES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
])

export const ARCHIVE_VIDEO_MIMES = new Set([
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "video/mpeg"
])

export const MAX_ARCHIVE_IMAGE_SIZE = 10 * 1024 * 1024
export const MAX_ARCHIVE_VIDEO_SIZE = 100 * 1024 * 1024

/**
 * Memeriksa signature biner file. Nilai MIME dari multipart tidak dipercaya
 * karena dapat diubah oleh client.
 */
export async function inspectArchiveMedia(filePath, fileSize) {
    const detected = await fileTypeFromFile(filePath)

    if (!detected) {
        throw new Error("Isi file tidak dikenali sebagai foto atau video yang valid.")
    }

    if (ARCHIVE_IMAGE_MIMES.has(detected.mime)) {
        if (fileSize > MAX_ARCHIVE_IMAGE_SIZE) {
            throw new Error("Ukuran foto maksimal 10 MB.")
        }
        return { mediaType: "image", mimeType: detected.mime }
    }

    if (ARCHIVE_VIDEO_MIMES.has(detected.mime)) {
        if (fileSize > MAX_ARCHIVE_VIDEO_SIZE) {
            throw new Error("Ukuran video maksimal 100 MB.")
        }
        return { mediaType: "video", mimeType: detected.mime }
    }

    throw new Error("Format arsip tidak didukung. Gunakan JPG, PNG, WebP, GIF, MP4, WebM, MOV, atau MPEG.")
}
