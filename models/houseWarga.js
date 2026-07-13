import db from  "../config/sqlconfig.js"

export default async function inputHouse(blok, nomor, alamat, status) {
    const sqlcommand = "INSERT INTO house (id, blok, nomor, alamat, status) VALUES (NULL, ?, ?, ?, ?)"
    try {
        const [hasilDB] = await db.execute(sqlcommand, [blok, nomor, alamat, status])
        return hasilDB 
    } catch (error) {
        console.log(error)
        return "error salah input house: " + error
    }
}   

export async function getHouses() {
    const sqlcommand = "SELECT * FROM house"
    try {
        const [hasilDB] = await db.execute(sqlcommand)
        return hasilDB
    } catch (error) {
        console.log(error)
        return "error salah get house: " + error
    }
}

export async function getHouseById(id) {
    const sqlcommand = "SELECT * FROM house WHERE id = ?"
    try {
        const [result] = await db.execute(sqlcommand, [id])
        return result[0];
    } catch (err) {
        console.log("error getHouseById:", err)
        return "error karena: " + err
    }
}
