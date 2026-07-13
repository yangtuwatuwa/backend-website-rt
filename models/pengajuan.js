import db from "../config/sqlconfig.js"

export async function inputPengajuan(familyId, keperluan, jenis) {
    const sqlcommand = "INSERT INTO letter (id, family_id, keperluan, jenis, status) VALUES (NULL, ?, ?, ?, 'pending')"
    try {
        const [hasilnya] = await db.execute(sqlcommand, [familyId, keperluan, jenis])
        return hasilnya
    } catch (err) {
        console.log("error bagian inputPengajuan: " + err)
        return "error karena: " + err
    }
}

export async function getPengajuanByFamily(familyId) {
    const sqlcommand = "SELECT * FROM letter WHERE family_id = ?"
    try {
        const [hasilnya] = await db.execute(sqlcommand, [familyId])
        return hasilnya
    } catch (err) {
        console.log("error bagian getPengajuanByFamily: " + err)
        return "error karena: " + err
    }
}

export async function getAllPengajuan() {
    const sqlcommand = "SELECT l.*, f.no_kk FROM letter l LEFT JOIN family f ON l.family_id = f.id"
    try {
        const [hasilnya] = await db.execute(sqlcommand)
        return hasilnya
    } catch (err) {
        console.log("error bagian getAllPengajuan: " + err)
        return "error karena: " + err
    }
}

export async function updatePengajuanStatus(id, status) {
    const sqlcommand = "UPDATE letter SET status = ? WHERE id = ?"
    try {
        const [hasilnya] = await db.execute(sqlcommand, [status, id])
        return hasilnya
    } catch (err) {
        console.log("error bagian updatePengajuanStatus: " + err)
        return "error karena: " + err
    }
}
