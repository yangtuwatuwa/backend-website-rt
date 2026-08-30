import db from "../config/sqlconfig.js"

export async function inputAnnouncement(judul, isi, executor = db) {
    const sqlcommand = "INSERT INTO announcement (id, judul, isi) VALUES (NULL, ?, ?)"
    try {
        const [hasilnya] = await executor.execute(sqlcommand, [judul, isi])
        return hasilnya
    } catch (err) {
        console.log("error bagian inputAnnouncement: " + err)
        return "error karena: " + err
    }
}

export async function getAnnouncements(executor = db) {
    const sqlcommand = "SELECT * FROM announcement"
    try {
        const [hasilnya] = await executor.execute(sqlcommand)
        return hasilnya
    } catch (err) {
        console.log("error bagian getAnnouncements: " + err)
        return "error karena: " + err
    }
}

export async function getAnnouncementById(id, executor = db) {
    const sqlcommand = "SELECT * FROM announcement WHERE id = ?"
    try {
        const [hasilnya] = await executor.execute(sqlcommand, [id])
        return hasilnya;
    } catch (err) {
        console.log("error bagian getAnnouncementById: " + err)
        return "error karena: " + err
    }
}

export async function updateAnnouncement(id, judul, isi, executor = db) {
    const sqlcommand = "UPDATE announcement SET judul = ?, isi = ? WHERE id = ?"
    try {
        const [hasilnya] = await executor.execute(sqlcommand, [judul, isi, id])
        return hasilnya
    } catch (err) {
        console.log("error bagian updateAnnouncement: " + err)
        return "error karena: " + err
    }
}

export async function deleteAnnouncement(id, executor = db) {
    const sqlcommand = "DELETE FROM announcement WHERE id = ?"
    try {
        const [hasilnya] = await executor.execute(sqlcommand, [id])
        return hasilnya
    } catch (err) {
        console.log("error bagian deleteAnnouncement: " + err)
        return "error karena: " + err
    }
}
