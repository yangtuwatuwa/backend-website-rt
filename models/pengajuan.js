import db from "../config/sqlconfig.js"

let migrationDone = false

/**
 * Auto Migration: Tambahkan kolom is_archived ke tabel letter jika belum ada.
 */
export async function ensureIsArchivedColumnExists(executor = db) {
    const client = executor || db

    if (client !== db) return
    if (migrationDone) return
    try {
        await client.execute("ALTER TABLE letter ADD COLUMN is_archived TINYINT(1) DEFAULT 0")
        console.log("[DB Migration] Berhasil menambahkan kolom is_archived ke tabel letter")
        migrationDone = true
    } catch (err) {
        const msg = String(err.message || err)
        // Duplicate column name 'is_archived' (ER_DUP_FIELDNAME / 1060)
        if (msg.includes("Duplicate column name") || msg.includes("1060") || err.code === "ER_DUP_FIELDNAME") {
            migrationDone = true
        } else {
            console.log("[DB Migration Info] letter.is_archived:", msg)
        }
    }
}

export async function inputPengajuan(familyId, keperluan, jenis, executor = db) {
    const client = executor || db
    await ensureIsArchivedColumnExists(client)
    const sqlcommand = "INSERT INTO letter (id, family_id, keperluan, jenis, status, is_archived) VALUES (NULL, ?, ?, ?, 'pending', 0)"
    try {
        const [hasilnya] = await client.execute(sqlcommand, [familyId, keperluan, jenis])
        return hasilnya
    } catch (err) {
        console.log("error bagian inputPengajuan: " + err)
        return "error karena: " + err
    }
}

export async function getPengajuanById(id, executor = db) {
    const client = executor || db
    await ensureIsArchivedColumnExists(client)
    const sqlcommand = "SELECT * FROM letter WHERE id = ?"
    try {
        const [hasilnya] = await client.execute(sqlcommand, [id])
        return hasilnya[0] || null
    } catch (err) {
        console.log("error bagian getPengajuanById: " + err)
        return null
    }
}

export async function getPengajuanByFamily(familyId, executor = db) {
    const client = executor || db
    await ensureIsArchivedColumnExists(client)
    const sqlcommand = "SELECT * FROM letter WHERE family_id = ? ORDER BY id DESC"
    try {
        const [hasilnya] = await client.execute(sqlcommand, [familyId])
        return hasilnya
    } catch (err) {
        console.log("error bagian getPengajuanByFamily: " + err)
        return "error karena: " + err
    }
}

export async function getAllPengajuan(executor = db) {
    const client = executor || db
    await ensureIsArchivedColumnExists(client)
    const sqlcommand = "SELECT l.*, f.no_kk FROM letter l LEFT JOIN family f ON l.family_id = f.id ORDER BY l.id DESC"
    try {
        const [hasilnya] = await client.execute(sqlcommand)
        return hasilnya
    } catch (err) {
        console.log("error bagian getAllPengajuan: " + err)
        return "error karena: " + err
    }
}

export async function updatePengajuanStatus(id, status, executor = db) {
    const client = executor || db
    await ensureIsArchivedColumnExists(client)
    const sqlcommand = "UPDATE letter SET status = ? WHERE id = ?"
    try {
        const [hasilnya] = await client.execute(sqlcommand, [status, id])
        return hasilnya
    } catch (err) {
        console.log("error bagian updatePengajuanStatus: " + err)
        return "error karena: " + err
    }
}

export async function updatePengajuanArchivedStatus(id, isArchived, executor = db) {
    const client = executor || db
    await ensureIsArchivedColumnExists(client)
    const val = isArchived ? 1 : 0
    const sqlcommand = "UPDATE letter SET is_archived = ? WHERE id = ?"
    try {
        const [hasilnya] = await client.execute(sqlcommand, [val, id])
        return hasilnya
    } catch (err) {
        console.log("error bagian updatePengajuanArchivedStatus: " + err)
        return "error karena: " + err
    }
}


