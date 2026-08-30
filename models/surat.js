import db from "../config/sqlconfig.js"

let isInitialized = false

export async function initSuratTables(executor = db) {
    const client = executor || db

    if (client !== db) return
    if (isInitialized) return
    try {
        await client.execute(`
            CREATE TABLE IF NOT EXISTS surat_masuk (
                id INT AUTO_INCREMENT PRIMARY KEY,
                no_agenda VARCHAR(50) NOT NULL,
                tanggal_masuk DATETIME DEFAULT CURRENT_TIMESTAMP,
                instansi_pengirim VARCHAR(200) NOT NULL,
                perihal VARCHAR(200) NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `)

        await client.execute(`
            CREATE TABLE IF NOT EXISTS surat_keluar (
                id INT AUTO_INCREMENT PRIMARY KEY,
                no_agenda VARCHAR(50) NOT NULL,
                tanggal_keluar DATETIME DEFAULT CURRENT_TIMESTAMP,
                penerima VARCHAR(200) NOT NULL,
                perihal VARCHAR(200) NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `)
        isInitialized = true
    } catch (err) {
        console.log("error bagian initSuratTables: " + err)
    }
}

// === SURAT MASUK ===

export async function createSuratMasuk(instansiPengirim, perihal, executor = db) {
    const client = executor || db
    await initSuratTables(client)
    try {
        const [countResult] = await client.execute("SELECT COUNT(*) AS total FROM surat_masuk")
        const nextNum = (countResult[0]?.total || 0) + 1
        const year = new Date().getFullYear()
        const noAgenda = `SM/${year}/${String(nextNum).padStart(3, '0')}`

        const sqlcommand = "INSERT INTO surat_masuk (id, no_agenda, instansi_pengirim, perihal, tanggal_masuk) VALUES (NULL, ?, ?, ?, NOW())"
        const [result] = await client.execute(sqlcommand, [noAgenda, instansiPengirim, perihal])
        return { id: result.insertId, no_agenda: noAgenda }
    } catch (err) {
        console.log("error bagian createSuratMasuk: " + err)
        return "error karena: " + err
    }
}

export async function getSuratMasukList(executor = db) {
    const client = executor || db
    await initSuratTables(client)
    const sqlcommand = "SELECT * FROM surat_masuk ORDER BY tanggal_masuk DESC, id DESC"
    try {
        const [result] = await client.execute(sqlcommand)
        return result
    } catch (err) {
        console.log("error bagian getSuratMasukList: " + err)
        return "error karena: " + err
    }
}

// === SURAT KELUAR ===

export async function createSuratKeluar(penerima, perihal, executor = db) {
    const client = executor || db
    await initSuratTables(client)
    try {
        const [countResult] = await client.execute("SELECT COUNT(*) AS total FROM surat_keluar")
        const nextNum = (countResult[0]?.total || 0) + 1
        const year = new Date().getFullYear()
        const noAgenda = `SK/${year}/${String(nextNum).padStart(3, '0')}`

        const sqlcommand = "INSERT INTO surat_keluar (id, no_agenda, penerima, perihal, tanggal_keluar) VALUES (NULL, ?, ?, ?, NOW())"
        const [result] = await client.execute(sqlcommand, [noAgenda, penerima, perihal])
        return { id: result.insertId, no_agenda: noAgenda }
    } catch (err) {
        console.log("error bagian createSuratKeluar: " + err)
        return "error karena: " + err
    }
}

export async function getSuratKeluarList(executor = db) {
    const client = executor || db
    await initSuratTables(client)
    const sqlcommand = "SELECT * FROM surat_keluar ORDER BY tanggal_keluar DESC, id DESC"
    try {
        const [result] = await client.execute(sqlcommand)
        return result
    } catch (err) {
        console.log("error bagian getSuratKeluarList: " + err)
        return "error karena: " + err
    }
}
