import db from "../config/sqlconfig.js"

let isInitialized = false

export async function initArchiveMediaTable(executor = db) {
    const client = executor || db
    if (client !== db || isInitialized) return

    await client.execute(`
        CREATE TABLE IF NOT EXISTS archive_media (
            id INT AUTO_INCREMENT PRIMARY KEY,
            judul VARCHAR(200) NOT NULL,
            kategori VARCHAR(100) NOT NULL,
            media_type ENUM('image', 'video') NOT NULL,
            mime_type VARCHAR(100) NOT NULL,
            file_path VARCHAR(255) NOT NULL,
            original_name VARCHAR(255) NOT NULL,
            file_size BIGINT UNSIGNED NOT NULL,
            uploaded_by INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_archive_media_created_at (created_at),
            INDEX idx_archive_media_category (kategori),
            INDEX idx_archive_media_type (media_type),
            CONSTRAINT fk_archive_media_uploader FOREIGN KEY (uploaded_by)
                REFERENCES acount(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    isInitialized = true
}

export async function createArchiveMedia(data, executor = db) {
    const client = executor || db
    await initArchiveMediaTable(client)
    const [result] = await client.execute(
        `INSERT INTO archive_media
            (judul, kategori, media_type, mime_type, file_path, original_name, file_size, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            data.judul,
            data.kategori,
            data.mediaType,
            data.mimeType,
            data.filePath,
            data.originalName,
            data.fileSize,
            data.uploadedBy || null
        ]
    )
    return result
}

export async function listArchiveMedia({ page, limit, kategori, mediaType }, executor = db) {
    const client = executor || db
    await initArchiveMediaTable(client)
    const conditions = []
    const params = []

    if (kategori) {
        conditions.push("kategori = ?")
        params.push(kategori)
    }
    if (mediaType) {
        conditions.push("media_type = ?")
        params.push(mediaType)
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""
    const offset = (page - 1) * limit
    // Text protocol dipakai karena MySQL 8.4 menolak placeholder LIMIT/OFFSET
    // pada prepared statement (ER_WRONG_ARGUMENTS). Nilainya sudah dinormalisasi
    // menjadi integer oleh controller.
    const [rows] = await client.query(
        `SELECT id, judul, kategori, media_type, mime_type, original_name, file_size, created_at
         FROM archive_media ${where}
         ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    )
    const [countRows] = await client.execute(
        `SELECT COUNT(*) AS total FROM archive_media ${where}`,
        params
    )

    return { rows, total: Number(countRows[0]?.total || 0) }
}

export async function getArchiveMediaById(id, executor = db) {
    const client = executor || db
    await initArchiveMediaTable(client)
    const [rows] = await client.execute("SELECT * FROM archive_media WHERE id = ?", [id])
    return rows[0]
}

export async function deleteArchiveMedia(id, executor = db) {
    const client = executor || db
    await initArchiveMediaTable(client)
    const [result] = await client.execute("DELETE FROM archive_media WHERE id = ?", [id])
    return result
}
