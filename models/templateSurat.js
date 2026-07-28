import db from "../config/sqlconfig.js"

let isInitialized = false

export async function initTemplateSuratTable() {
    if (isInitialized) return
    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS template_surat (
                id INT AUTO_INCREMENT PRIMARY KEY,
                judul VARCHAR(200) NOT NULL,
                deskripsi TEXT,
                kategori VARCHAR(100),
                file_path VARCHAR(255) NOT NULL,
                original_name VARCHAR(255),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `)
        isInitialized = true
    } catch (err) {
        console.log("error bagian initTemplateSuratTable: " + err)
    }
}

export async function createTemplateSurat(judul, deskripsi, kategori, filePath, originalName) {
    await initTemplateSuratTable()
    const sqlcommand = "INSERT INTO template_surat (id, judul, deskripsi, kategori, file_path, original_name) VALUES (NULL, ?, ?, ?, ?, ?)"
    try {
        const [result] = await db.execute(sqlcommand, [judul, deskripsi || "", kategori || "", filePath, originalName || ""])
        return result
    } catch (err) {
        console.log("error bagian createTemplateSurat: " + err)
        return "error karena: " + err
    }
}

export async function getTemplateSuratList(search = "") {
    await initTemplateSuratTable()
    let sqlcommand = "SELECT * FROM template_surat ORDER BY created_at DESC"
    let params = []
    
    if (search && search.trim() !== "") {
        sqlcommand = "SELECT * FROM template_surat WHERE judul LIKE ? OR kategori LIKE ? OR deskripsi LIKE ? ORDER BY created_at DESC"
        const searchPattern = `%${search}%`
        params = [searchPattern, searchPattern, searchPattern]
    }

    try {
        const [result] = await db.execute(sqlcommand, params)
        return result
    } catch (err) {
        console.log("error bagian getTemplateSuratList: " + err)
        return "error karena: " + err
    }
}

export async function getTemplateSuratById(id) {
    await initTemplateSuratTable()
    const sqlcommand = "SELECT * FROM template_surat WHERE id = ?"
    try {
        const [result] = await db.execute(sqlcommand, [id])
        return result[0]
    } catch (err) {
        console.log("error bagian getTemplateSuratById: " + err)
        return "error karena: " + err
    }
}

export async function updateTemplateSurat(id, dataToUpdate) {
    await initTemplateSuratTable()
    const fields = []
    const values = []
    
    Object.keys(dataToUpdate).forEach(key => {
        if (dataToUpdate[key] !== undefined) {
            fields.push(`${key} = ?`)
            values.push(dataToUpdate[key])
        }
    })
    
    if (fields.length === 0) {
        return "error karena: tidak ada fields yang diupdate"
    }
    
    const sqlcommand = `UPDATE template_surat SET ${fields.join(", ")} WHERE id = ?`
    values.push(id)
    
    try {
        const [result] = await db.execute(sqlcommand, values)
        return result
    } catch (err) {
        console.log("error bagian updateTemplateSurat: " + err)
        return "error karena: " + err
    }
}

export async function deleteTemplateSurat(id) {
    await initTemplateSuratTable()
    const sqlcommand = "DELETE FROM template_surat WHERE id = ?"
    try {
        const [result] = await db.execute(sqlcommand, [id])
        return result
    } catch (err) {
        console.log("error bagian deleteTemplateSurat: " + err)
        return "error karena: " + err
    }
}
