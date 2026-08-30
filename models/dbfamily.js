import db from "../config/sqlconfig.js"
export default async function keluarga(id, executor = db) {
    const sqlcomand = `
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
            w.house_id,
            h.blok AS house_blok,
            h.nomor AS house_nomor,
            h.alamat AS house_alamat,
            h.status AS house_status
        FROM warga w
        LEFT JOIN house h ON w.house_id = h.id
        WHERE w.family_id = ? AND w.status_data = 'diterima'
    `
    try {
        const [hasil] = await executor.execute(sqlcomand , [id])
        return hasil;
    } catch (err) {
        console.log(err)
        return "error karena: " + err
    }
}
