import db from "../config/sqlconfig.js"

export async function warganya(nikk, nama, jenisKelamin, tglLahir, statusHidup, noHp, umur, familyId, houseId, status = "diterima", isKepalaKeluarga = false){
    try {
        const sqlcommand = "INSERT INTO warga (id, nik, nama, jenis_kelamin, tgl_lahir, status_hidup, no_hp, umur, family_id, house_id, status_data) VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)" 
        const [hasilnya] = await db.execute(sqlcommand, [nikk, nama, jenisKelamin, tglLahir, statusHidup, noHp, umur, familyId, houseId, status])
        
        if (hasilnya && hasilnya.insertId) {
            const citizenId = hasilnya.insertId
            
            // Ambil data kepala_keluarga_id saat ini untuk KK ini
            const [familyRows] = await db.execute("SELECT kepala_keluarga_id FROM family WHERE id = ?", [familyId])
            if (familyRows && familyRows.length > 0) {
                const currentHeadId = familyRows[0].kepala_keluarga_id
                
                // Jika request adalah kepala keluarga, atau kepala keluarga saat ini masih dummy (1) atau belum terisi (null/0)
                if (isKepalaKeluarga || currentHeadId === 1 || currentHeadId === null || currentHeadId === 0) {
                    console.log(`[Auto-Head] Update family id ${familyId} kepala_keluarga_id -> ${citizenId}`)
                    await db.execute("UPDATE family SET kepala_keluarga_id = ? WHERE id = ?", [citizenId, familyId])
                }
            }
        }
        
        return hasilnya;
    } catch (err) {
        console.log(err)
        return "error mas di model : "+ err;
    }
}

export async function getWargas() {
    const sqlcommand = `
        SELECT 
            w.id AS warga_id,
            w.nik,
            w.nama,
            w.jenis_kelamin,
            w.tgl_lahir,
            w.status_hidup,
            w.no_hp,
            w.umur,
            w.family_id,
            f.no_kk AS family_nokk,
            w.house_id,
            h.blok AS house_blok,
            h.nomor AS house_nomor,
            h.alamat AS house_alamat,
            h.status AS house_status,
            w.status_data AS status,
            a.id AS account_id,
            a.username AS account_username
        FROM warga w
        LEFT JOIN family f ON w.family_id = f.id
        LEFT JOIN house h ON w.house_id = h.id
        LEFT JOIN acount a ON a.family_id = w.family_id
    `
    try {
        const [hasilnya] = await db.execute(sqlcommand)
        return hasilnya;
    } catch (err) {
        console.log(err)
        return "error mas di model : "+ err;
    }
}

export async function getWargaById(id) {
    const sqlcommand = "SELECT * FROM warga WHERE id = ?"
    try {
        const [result] = await db.execute(sqlcommand, [id])
        return result[0];
    } catch (err) {
        console.log(err)
        return "error mas di model : "+ err;
    }
}

export async function getPendingWarga() {
    const sqlcommand = `
        SELECT 
            w.id AS warga_id,
            w.nik,
            w.nama,
            w.jenis_kelamin,
            w.tgl_lahir,
            w.status_hidup,
            w.no_hp,
            w.umur,
            w.family_id,
            f.no_kk AS family_nokk,
            w.house_id,
            h.blok AS house_blok,
            h.nomor AS house_nomor,
            h.alamat AS house_alamat,
            h.status AS house_status,
            w.status_data AS status
        FROM warga w
        LEFT JOIN family f ON w.family_id = f.id
        LEFT JOIN house h ON w.house_id = h.id
        WHERE w.status_data = 'pending'
    `
    try {
        const [hasilnya] = await db.execute(sqlcommand)
        return hasilnya;
    } catch (err) {
        console.log(err)
        return "error mas di model : "+ err;
    }
}

export async function updateWargaStatus(id, status) {
    const sqlcommand = "UPDATE warga SET status_data = ? WHERE id = ?"
    try {
        const [result] = await db.execute(sqlcommand, [status, id])
        return result;
    } catch (err) {
        console.log(err)
        return "error mas di model : "+ err;
    }
}

export async function updateWargaFields(id, fields) {
    const keys = Object.keys(fields)
    if (keys.length === 0) return null

    const setClause = keys.map(k => `${k} = ?`).join(", ")
    const values = Object.values(fields)
    values.push(id)

    const sqlcommand = `UPDATE warga SET ${setClause} WHERE id = ?`
    try {
        const [result] = await db.execute(sqlcommand, values)
        return result
    } catch (err) {
        console.log("error updateWargaFields:", err)
        return "error karena: " + err
    }
}