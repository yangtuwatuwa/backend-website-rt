import db from "../config/sqlconfig.js"

export async function inputPengaduan(familyId, isi, jenis_pengaduan) {
    const sqlcommand = "INSERT INTO report (id, family_id, isi, jenis_pengaduan, status) VALUES (NULL, ?, ?, ?, 'pending')"
    try {
        const [hasilnya] = await db.execute(sqlcommand, [familyId, isi, jenis_pengaduan])
        return hasilnya
    } catch (err) {
        console.log("error bagian inputPengaduan: " + err)
        return "error karena: " + err
    }
}

export async function getPengaduanByFamily(familyId) {
    const sqlcommand = "SELECT * FROM report WHERE family_id = ?"
    try {
        const [hasilnya] = await db.execute(sqlcommand, [familyId])
        return hasilnya
    } catch (err) {
        console.log("error bagian getPengaduanByFamily: " + err)
        return "error karena: " + err
    }
}

export async function getAllPengaduan() {
    const sqlcommand = "SELECT r.*, f.no_kk FROM report r LEFT JOIN family f ON r.family_id = f.id"
    try {
        const [hasilnya] = await db.execute(sqlcommand)
        return hasilnya
    } catch (err) {
        console.log("error bagian getAllPengaduan: " + err)
        return "error karena: " + err
    }
}

export async function updatePengaduanStatus(id, status) {
    const sqlcommand = "UPDATE report SET status = ? WHERE id = ?"
    try {
        const [hasilnya] = await db.execute(sqlcommand, [status, id])
        return hasilnya
    } catch (err) {
        console.log("error bagian updatePengaduanStatus: " + err)
        return "error karena: " + err
    }
}
