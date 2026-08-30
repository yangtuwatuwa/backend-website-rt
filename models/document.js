import db from "../config/sqlconfig.js"

export async function createDocument(familyId, residentId, type, filePath, executor = db) {
    const sqlcommand = "INSERT INTO document (id, family_id, resident_id, type, file_path) VALUES (NULL, ?, ?, ?, ?)"
    try {
        const [result] = await executor.execute(sqlcommand, [familyId, residentId, type, filePath])
        return result
    } catch (err) {
        console.log("error createDocument:", err)
        return "error karena: " + err
    }
}

export async function getDocumentById(id, executor = db) {
    const sqlcommand = "SELECT * FROM document WHERE id = ?"
    try {
        const [result] = await executor.execute(sqlcommand, [id])
        return result[0]
    } catch (err) {
        console.log("error getDocumentById:", err)
        return "error karena: " + err
    }
}

export async function getDocumentsByResident(residentId, executor = db) {
    const sqlcommand = "SELECT * FROM document WHERE resident_id = ?"
    try {
        const [result] = await executor.execute(sqlcommand, [residentId])
        return result
    } catch (err) {
        console.log("error getDocumentsByResident:", err)
        return "error karena: " + err
    }
}

export async function deleteDocument(id, executor = db) {
    const sqlcommand = "DELETE FROM document WHERE id = ?"
    try {
        const [result] = await executor.execute(sqlcommand, [id])
        return result
    } catch (err) {
        console.log("error deleteDocument:", err)
        return "error karena: " + err
    }
}

