import db from "../config/sqlconfig.js"

export async function inputAnnouncement(judul, isi) {
    const sqlcommand = "INSERT INTO announcement (id, judul, isi) VALUES (NULL, ?, ?)"
    try {
        const [hasilnya] = await db.execute(sqlcommand, [judul, isi])
        return hasilnya
    } catch (err) {
        console.log("error bagian inputAnnouncement: " + err)
        return "error karena: " + err
    }
}

export async function getAnnouncements() {
    const sqlcommand = "SELECT * FROM announcement"
    try {
        const [hasilnya] = await db.execute(sqlcommand)
        return hasilnya
    } catch (err) {
        console.log("error bagian getAnnouncements: " + err)
        return "error karena: " + err
    }
}

export async function getAnnouncementById(id) {
    const sqlcommand = "SELECT * FROM announcement WHERE id = ?"
    try {
        const [hasilnya] = await db.execute(sqlcommand, [id])
        return hasilnya;
    } catch (err) {
        console.log("error bagian getAnnouncementById: " + err)
        return "error karena: " + err
    }
}

export async function updateAnnouncement(id, judul, isi) {
    const sqlcommand = "UPDATE announcement SET judul = ?, isi = ? WHERE id = ?"
    try {
        const [hasilnya] = await db.execute(sqlcommand, [judul, isi, id])
        return hasilnya
    } catch (err) {
        console.log("error bagian updateAnnouncement: " + err)
        return "error karena: " + err
    }
}

export async function deleteAnnouncement(id) {
    const sqlcommand = "DELETE FROM announcement WHERE id = ?"
    try {
        const [hasilnya] = await db.execute(sqlcommand, [id])
        return hasilnya
    } catch (err) {
        console.log("error bagian deleteAnnouncement: " + err)
        return "error karena: " + err
    }
}
