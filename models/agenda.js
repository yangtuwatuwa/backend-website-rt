import db from "../config/sqlconfig.js"

export async function createAgenda(kategori, judul, deskripsi, tanggal, waktu, tempat) {
    const sqlcommand = "INSERT INTO agenda (id, kategori, judul, deskripsi, tanggal, waktu, tempat) VALUES (NULL, ?, ?, ?, ?, ?, ?)"
    try {
        const [result] = await db.execute(sqlcommand, [kategori, judul, deskripsi, tanggal, waktu, tempat])
        return result
    } catch (err) {
        console.log("error bagian createAgenda: " + err)
        return "error karena: " + err
    }
}

export async function getAgendas(search = "") {
    let sqlcommand = "SELECT * FROM agenda ORDER BY tanggal ASC"
    let params = []
    
    if (search && search.trim() !== "") {
        sqlcommand = "SELECT * FROM agenda WHERE judul LIKE ? OR kategori LIKE ? OR tempat LIKE ? ORDER BY tanggal ASC"
        const searchPattern = `%${search}%`
        params = [searchPattern, searchPattern, searchPattern]
    }
    
    try {
        const [result] = await db.execute(sqlcommand, params)
        return result
    } catch (err) {
        console.log("error bagian getAgendas: " + err)
        return "error karena: " + err
    }
}

export async function getAgendaById(id) {
    const sqlcommand = "SELECT * FROM agenda WHERE id = ?"
    try {
        const [result] = await db.execute(sqlcommand, [id])
        return result[0]
    } catch (err) {
        console.log("error bagian getAgendaById: " + err)
        return "error karena: " + err
    }
}

export async function updateAgenda(id, dataToUpdate) {
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
    
    const sqlcommand = `UPDATE agenda SET ${fields.join(", ")} WHERE id = ?`
    values.push(id)
    
    try {
        const [result] = await db.execute(sqlcommand, values)
        return result
    } catch (err) {
        console.log("error bagian updateAgenda: " + err)
        return "error karena: " + err
    }
}

export async function deleteAgenda(id) {
    const sqlcommand = "DELETE FROM agenda WHERE id = ?"
    try {
        const [result] = await db.execute(sqlcommand, [id])
        return result
    } catch (err) {
        console.log("error bagian deleteAgenda: " + err)
        return "error karena: " + err
    }
}
