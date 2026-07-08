import db from "../config/sqlconfig.js"

export async function inputWarganya(nokk, houseId , kepalaKelaurgaId ){
    const sqlcommand = "INSERT INTO family (id , no_kk , house_id , kepala_keluarga_id) VALUES (NULL ,  ? , ? , ?) "
    try {
        const hasilnya = await db.execute(sqlcommand , [nokk , houseId , kepalaKelaurgaId])
        return hasilnya
    } catch (err) {
        console.log(err)
        return "error karena: " + err
    }
}

export async function getWarganya() {
    const sqlcommand = "SELECT * FROM family"
    try {
        const [result] = await db.execute(sqlcommand)
        return result
    } catch (err) {
        console.log(err)
        return "error karena: " + err
    }
}