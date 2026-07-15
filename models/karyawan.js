import db from "../config/sqlconfig.js"

export async function getKaryawanList() {
    const sqlcommand = "SELECT * FROM karyawan"
    try {
        const [hasilnya] = await db.execute(sqlcommand)
        return hasilnya
    } catch (err) {
        console.log("error bagian getKaryawanList: " + err)
        return "error karena: " + err
    }
}

export async function hasUserVoted(accountId) {
    const sqlcommand = "SELECT * FROM vote_karyawan WHERE account_id = ?"
    try {
        const [hasilnya] = await db.execute(sqlcommand, [accountId])
        return hasilnya.length > 0
    } catch (err) {
        console.log("error bagian hasUserVoted: " + err)
        return "error karena: " + err
    }
}

export async function insertVote(accountId, karyawanId) {
    const sqlcommand = "INSERT INTO vote_karyawan (id, account_id, karyawan_id) VALUES (NULL, ?, ?)"
    try {
        const [hasilnya] = await db.execute(sqlcommand, [accountId, karyawanId])
        return hasilnya
    } catch (err) {
        console.log("error bagian insertVote: " + err)
        return "error karena: " + err
    }
}

export async function getVoteResults() {
    const sqlcommand = `
        SELECT k.id, k.nama, k.jabatan, COUNT(v.id) AS jumlah_vote 
        FROM karyawan k 
        LEFT JOIN vote_karyawan v ON k.id = v.karyawan_id 
        GROUP BY k.id
    `
    try {
        const [hasilnya] = await db.execute(sqlcommand)
        return hasilnya
    } catch (err) {
        console.log("error bagian getVoteResults: " + err)
        return "error karena: " + err
    }
}
