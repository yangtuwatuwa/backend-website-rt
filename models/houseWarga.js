import db from  "../config/sqlconfig.js"

export async function getHouses(executor = db) {

    const sqlcommand = "SELECT * FROM house"
    try {
        const [hasilDB] = await executor.execute(sqlcommand)
        return hasilDB
    } catch (error) {
        console.log(error)
        return "error salah get house: " + error
    }
}

export async function getHouseById(id, executor = db) {
    const sqlcommand = "SELECT * FROM house WHERE id = ?"
    try {
        const [result] = await executor.execute(sqlcommand, [id])
        return result[0];
    } catch (err) {
        console.log("error getHouseById:", err)
        return "error karena: " + err
    }
}
