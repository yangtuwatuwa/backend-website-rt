import db from "../config/sqlconfig.js"

export async function inputPengaduan(familyId, isi, jenis_pengaduan, executor = db) {
    const client = executor || db
    const sqlcommand = "INSERT INTO report (id, family_id, isi, jenis_pengaduan, status) VALUES (NULL, ?, ?, ?, 'pending')"
    try {
        const [hasilnya] = await client.execute(sqlcommand, [familyId, isi, jenis_pengaduan])
        return hasilnya
    } catch (err) {
        console.log("error bagian inputPengaduan: " + err)
        return "error karena: " + err
    }
}

export async function getPengaduanById(id, executor = db) {
    const client = executor || db
    const sqlcommand = "SELECT * FROM report WHERE id = ?"
    try {
        const [hasilnya] = await client.execute(sqlcommand, [id])
        return hasilnya[0] || null
    } catch (err) {
        console.log("error bagian getPengaduanById: " + err)
        return null
    }
}

export async function getPengaduanByFamily(familyId, executor = db) {
    const client = executor || db
    const sqlcommand = "SELECT * FROM report WHERE family_id = ?"
    try {
        const [hasilnya] = await client.execute(sqlcommand, [familyId])
        return hasilnya
    } catch (err) {
        console.log("error bagian getPengaduanByFamily: " + err)
        return "error karena: " + err
    }
}

export async function getAllPengaduan(executor = db) {
    const client = executor || db
    const sqlcommand = "SELECT r.*, f.no_kk FROM report r LEFT JOIN family f ON r.family_id = f.id"
    try {
        const [hasilnya] = await client.execute(sqlcommand)
        return hasilnya
    } catch (err) {
        console.log("error bagian getAllPengaduan: " + err)
        return "error karena: " + err
    }
}

export async function updatePengaduanStatus(id, status, catatan = null, executor = db) {
    const client = executor || db
    if (catatan !== null && catatan !== undefined) {
        try {
            const [hasil] = await client.execute("UPDATE report SET status = ?, catatan = ? WHERE id = ?", [status, catatan, id])
            return hasil
        } catch (catatanErr) {
            if (client !== db) {
                // Injected executors must not run DDL. If the full update fails,
                // only status is persisted; catatan is intentionally not saved.
                const [hasil] = await client.execute("UPDATE report SET status = ? WHERE id = ?", [status, id])
                return hasil
            }

            try {
                await client.execute("ALTER TABLE report ADD COLUMN IF NOT EXISTS catatan TEXT")
                const [hasil] = await client.execute("UPDATE report SET status = ?, catatan = ? WHERE id = ?", [status, catatan, id])
                return hasil
            } catch (alterErr) {
                const [hasil] = await client.execute("UPDATE report SET status = ? WHERE id = ?", [status, id])
                return hasil
            }
        }
    }
    const sqlcommand = "UPDATE report SET status = ? WHERE id = ?"
    try {
        const [hasilnya] = await client.execute(sqlcommand, [status, id])
        return hasilnya
    } catch (err) {
        console.log("error bagian updatePengaduanStatus: " + err)
        return "error karena: " + err
    }
}

export async function deletePengaduan(id, executor = db) {
    const client = executor || db
    const sqlcommand = "DELETE FROM report WHERE id = ?"
    try {
        const [hasilnya] = await client.execute(sqlcommand, [id])
        return hasilnya
    } catch (err) {
        console.log("error bagian deletePengaduan: " + err)
        return "error karena: " + err
    }
}

