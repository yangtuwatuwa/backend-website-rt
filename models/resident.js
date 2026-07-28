import db from "../config/sqlconfig.js"

export async function inputWarganya(nokk, houseId , kepalaKelaurgaId ){
    const sqlcommand = "INSERT INTO family (id , no_kk , house_id , kepala_keluarga_id) VALUES (NULL , ? , ? , ?) "
    try {
        const targetHead = (kepalaKelaurgaId !== undefined && kepalaKelaurgaId !== null && kepalaKelaurgaId !== "") ? kepalaKelaurgaId : null
        const hasilnya = await db.execute(sqlcommand , [nokk , houseId , targetHead])
        return hasilnya
    } catch (err) {
        console.log(err)
        return "error karena: " + err
    }
}

export async function getWarganya() {
    const sqlcommand = `
        SELECT 
            f.id AS family_id, 
            f.no_kk,
            f.house_id,
            h.blok AS house_blok,
            h.nomor AS house_nomor,
            h.alamat AS house_alamat,
            h.status AS house_status,
            f.kepala_keluarga_id,
            w.nama AS kepala_keluarga_nama,
            w.nik AS kepala_keluarga_nik,
            w.no_hp AS kepala_keluarga_nohp,
            a.id AS account_id,
            a.username AS account_username
        FROM family f
        LEFT JOIN house h ON f.house_id = h.id
        LEFT JOIN warga w ON f.kepala_keluarga_id = w.id
        LEFT JOIN acount a ON a.family_id = f.id
    `
    try {
        const [result] = await db.execute(sqlcommand)
        return result
    } catch (err) {
        console.log(err)
        return "error karena: " + err
    }
}

export async function editedWarga(id, encryptedNik) {
   const sqlcommand = "UPDATE family SET no_kk = ? WHERE id = ?"
   try {
   const [result] = await db.execute(sqlcommand,[encryptedNik, id]) 
   return result 
   } catch (err) {
    return "salah di bagian kk"
   }
}

export async function getFamilyById(id) {
    const sqlcommand = "SELECT * FROM family WHERE id = ?"
    try {
        const [result] = await db.execute(sqlcommand, [id])
        return result[0];
    } catch (err) {
        console.log(err)
        return "error karena: " + err
    }
}
