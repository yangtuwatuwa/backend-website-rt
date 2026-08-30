import db from "../config/sqlconfig.js"

let deleteKaryawanSavepointCounter = 0

export async function getKaryawanList(executor = db) {
    const client = executor || db
    const sqlcommand = "SELECT * FROM karyawan"
    try {
        const [hasilnya] = await client.execute(sqlcommand)
        return hasilnya
    } catch (err) {
        console.log("error bagian getKaryawanList: " + err)
        return "error karena: " + err
    }
}

export async function hasUserVoted(accountId, executor = db) {
    const client = executor || db
    const sqlcommand = "SELECT * FROM vote_karyawan WHERE account_id = ?"
    try {
        const [hasilnya] = await client.execute(sqlcommand, [accountId])
        return hasilnya.length > 0
    } catch (err) {
        console.log("error bagian hasUserVoted: " + err)
        return "error karena: " + err
    }
}

export async function insertVote(accountId, karyawanId, executor = db) {
    const client = executor || db
    const sqlcommand = "INSERT INTO vote_karyawan (id, account_id, karyawan_id) VALUES (NULL, ?, ?)"
    try {
        const [hasilnya] = await client.execute(sqlcommand, [accountId, karyawanId])
        return hasilnya
    } catch (err) {
        console.log("error bagian insertVote: " + err)
        return "error karena: " + err
    }
}

export async function getVoteResults(executor = db) {
    const client = executor || db
    const sqlcommand = `
        SELECT k.id, k.nama, k.jabatan, COUNT(v.id) AS jumlah_vote 
        FROM karyawan k 
        LEFT JOIN vote_karyawan v ON k.id = v.karyawan_id 
        GROUP BY k.id
    `
    try {
        const [hasilnya] = await client.execute(sqlcommand)
        return hasilnya
    } catch (err) {
        console.log("error bagian getVoteResults: " + err)
        return "error karena: " + err
    }
}
export async function insertKaryawan(nama, jabatan, deskripsi = "", foto = null, executor = db) {
    const client = executor || db
    const sqlcommand = "INSERT INTO karyawan (id, nama, jabatan) VALUES (NULL, ?, ?)"

    const params = [nama, jabatan]
    
    try {
        const [result] = await client.execute("INSERT INTO karyawan (id, nama, jabatan, deskripsi, foto) VALUES (NULL, ?, ?, ?, ?)", [nama, jabatan, deskripsi || "", foto || ""])
        return result
    } catch (err) {
        if (client !== db) {
            // Injected executors must not run DDL. If the full insert fails,
            // only nama and jabatan are persisted; deskripsi/foto are omitted.
            const [result] = await client.execute(sqlcommand, params)
            return result
        }

        try {
            await client.execute("ALTER TABLE karyawan ADD COLUMN IF NOT EXISTS deskripsi TEXT, ADD COLUMN IF NOT EXISTS foto VARCHAR(255)")
            const [result] = await client.execute("INSERT INTO karyawan (id, nama, jabatan, deskripsi, foto) VALUES (NULL, ?, ?, ?, ?)", [nama, jabatan, deskripsi || "", foto || ""])
            return result
        } catch (alterErr) {
            const [result] = await client.execute(sqlcommand, params)
            return result
        }
    }
}

export async function deleteKaryawan(id, executor = db) {
    const client = executor || db
    const usesInjectedExecutor = client !== db
    const savepointName = usesInjectedExecutor
        ? `sp_delete_karyawan_${++deleteKaryawanSavepointCounter}`
        : null
    let savepointCreated = false
    const sqlcommand = "DELETE FROM karyawan WHERE id = ?"
    try {
        if (savepointName) {
            await client.query(`SAVEPOINT ${savepointName}`)
            savepointCreated = true
        }

        await client.execute("DELETE FROM vote_karyawan WHERE karyawan_id = ?", [id])
        const [result] = await client.execute(sqlcommand, [id])

        if (savepointCreated) {
            await client.query(`RELEASE SAVEPOINT ${savepointName}`)
            savepointCreated = false
        }

        return result
    } catch (err) {
        if (savepointCreated) {
            try {
                await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`)
            } catch (rollbackErr) {
                console.log("error rollback savepoint deleteKaryawan: " + rollbackErr)
            }

            try {
                await client.query(`RELEASE SAVEPOINT ${savepointName}`)
            } catch (releaseErr) {
                console.log("error release savepoint deleteKaryawan: " + releaseErr)
            }
        }

        console.log("error bagian deleteKaryawan: " + err)
        return "error karena: " + err
    }
}

