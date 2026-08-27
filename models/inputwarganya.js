import db from "../config/sqlconfig.js"

export async function autoHealFamilyHeads() {
    try {
        const [families] = await db.execute(`
            SELECT f.id AS family_id, f.kepala_keluarga_id, w.id AS valid_head_id
            FROM family f
            LEFT JOIN warga w ON f.kepala_keluarga_id = w.id AND w.family_id = f.id
                AND (w.status_data IS NULL OR w.status_data IN ('pending', 'diterima'))
        `)

        if (Array.isArray(families)) {
            for (const fam of families) {
                if (!fam.valid_head_id) {
                    const [firstWarga] = await db.execute(
                        "SELECT id FROM warga WHERE family_id = ? AND (status_data IS NULL OR status_data IN ('pending', 'diterima')) ORDER BY id ASC LIMIT 1",
                        [fam.family_id]
                    )
                    if (Array.isArray(firstWarga) && firstWarga.length > 0) {
                        const newHeadId = firstWarga[0].id
                        console.log(`[Auto-Heal Family Head] Fixing family ${fam.family_id}: kepala_keluarga_id (${fam.kepala_keluarga_id}) -> ${newHeadId}`)
                        await db.execute("UPDATE family SET kepala_keluarga_id = ? WHERE id = ?", [newHeadId, fam.family_id])
                    }
                }
            }
        }
    } catch (err) {
        console.log("[Auto-Heal Error]:", err)
    }
}

export async function warganya(nikk, nama, jenisKelamin, tglLahir, statusHidup, noHp, umur, familyId, houseId, status = "diterima", isKepalaKeluarga = false){
    try {
        const sqlcommand = "INSERT INTO warga (id, nik, nama, jenis_kelamin, tgl_lahir, status_hidup, no_hp, umur, family_id, house_id, status_data) VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)" 
        const [hasilnya] = await db.execute(sqlcommand, [nikk, nama, jenisKelamin, tglLahir, statusHidup, noHp, umur, familyId, houseId, status])
        
        if (hasilnya && hasilnya.insertId) {
            const citizenId = hasilnya.insertId
            
            // Cek apakah request meminta warga ini sebagai kepala keluarga (hanya jika eksplisit true)
            const isExplicitHead = isKepalaKeluarga === true || isKepalaKeluarga === "true" || isKepalaKeluarga === 1;
            
            if (isExplicitHead) {
                console.log(`[Auto-Head] Update family id ${familyId} kepala_keluarga_id -> ${citizenId}`)
                await db.execute("UPDATE family SET kepala_keluarga_id = ? WHERE id = ?", [citizenId, familyId])
            } else {
                const [familyRows] = await db.execute("SELECT kepala_keluarga_id FROM family WHERE id = ?", [familyId])
                if (familyRows && familyRows.length > 0) {
                    const currentHeadId = familyRows[0].kepala_keluarga_id
                    let isHeadValid = false
                    if (currentHeadId && currentHeadId !== 0) {
                        const [checkHead] = await db.execute("SELECT id FROM warga WHERE id = ? AND family_id = ? AND (status_data IS NULL OR status_data IN ('pending', 'diterima'))", [currentHeadId, familyId])
                        if (Array.isArray(checkHead) && checkHead.length > 0) {
                            isHeadValid = true
                        }
                    }

                    if (!isHeadValid) {
                        console.log(`[Auto-Head First/Fix Member] Set family id ${familyId} kepala_keluarga_id -> ${citizenId}`)
                        await db.execute("UPDATE family SET kepala_keluarga_id = ? WHERE id = ?", [citizenId, familyId])
                    }
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
    await autoHealFamilyHeads();
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
        WHERE w.status_data IS NULL OR w.status_data IN ('pending', 'diterima')
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
    const sqlcommand = "SELECT * FROM warga WHERE id = ? AND (status_data IS NULL OR status_data IN ('pending', 'diterima'))"
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
            w.id,
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
            d.id AS ktp_document_id,
            d.type AS document_type
        FROM warga w
        LEFT JOIN family f ON w.family_id = f.id
        LEFT JOIN house h ON w.house_id = h.id
        LEFT JOIN document d ON (d.resident_id = w.id OR d.family_id = w.family_id) AND (d.type IN ('ktp', 'kia', 'akta', 'foto', 'kk') OR d.type LIKE '%ktp%' OR d.type LIKE '%kia%')
        WHERE LOWER(w.status_data) = 'pending' OR w.status_data IS NULL
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
    const sqlcommand = "UPDATE warga SET status_data = ? WHERE id = ? AND (status_data IS NULL OR status_data IN ('pending', 'diterima'))"
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

    const sqlcommand = `UPDATE warga SET ${setClause} WHERE id = ? AND (status_data IS NULL OR status_data IN ('pending', 'diterima'))`
    try {
        const [result] = await db.execute(sqlcommand, values)
        return result
    } catch (err) {
        console.log("error updateWargaFields:", err)
        return "error karena: " + err
    }
}

/**
 * Cek apakah warga ini adalah kepala keluarga di tabel family.
 * @param {number} wargaId - ID warga yang mau dicek
 * @returns {boolean} true jika warga ini adalah kepala keluarga
 */
export async function isKepalaKeluarga(wargaId) {
    const sqlcommand = "SELECT id FROM family WHERE kepala_keluarga_id = ?"
    try {
        const [result] = await db.execute(sqlcommand, [wargaId])
        return result.length > 0
    } catch (err) {
        console.log("error isKepalaKeluarga:", err)
        throw err
    }
}

/**
 * Hapus data warga dari tabel warga berdasarkan ID.
 * @param {number} id - ID warga yang akan dihapus
 */
export async function deleteWargaById(id) {
    const sqlcommand = "UPDATE warga SET status_data = 'ditolak' WHERE id = ? AND (status_data IS NULL OR status_data IN ('pending', 'diterima'))"
    try {
        const [result] = await db.execute(sqlcommand, [id])
        return result
    } catch (err) {
        console.log("error deleteWargaById:", err)
        throw err
    }
}

/**
 * Ambil daftar anggota keluarga lain dalam 1 KK (kecuali wargaId yang mau dihapus).
 */
export async function getOtherFamilyMembers(familyId, excludeWargaId) {
    const sqlcommand = "SELECT id, nama FROM warga WHERE family_id = ? AND id != ? AND (status_data IS NULL OR status_data IN ('pending', 'diterima')) ORDER BY id ASC"
    try {
        const [result] = await db.execute(sqlcommand, [familyId, excludeWargaId])
        return result
    } catch (err) {
        console.log("error getOtherFamilyMembers:", err)
        throw err
    }
}

/**
 * Update kepala_keluarga_id di tabel family ke ID warga baru.
 */
export async function updateFamilyHead(familyId, newHeadWargaId) {
    const sqlcommand = "UPDATE family SET kepala_keluarga_id = ? WHERE id = ?"
    try {
        const [result] = await db.execute(sqlcommand, [newHeadWargaId, familyId])
        return result
    } catch (err) {
        console.log("error updateFamilyHead:", err)
        throw err
    }
}

/**
 * Update NIK warga di tabel warga.
 * @param {number} wargaId - ID warga yang NIK-nya akan diubah
 * @param {string} encryptedNik - NIK baru (sudah terenkripsi)
 * @returns {Object} result dari query UPDATE
 */
export async function updateWargaNik(wargaId, encryptedNik) {
    const sqlcommand = "UPDATE warga SET nik = ? WHERE id = ?"
    try {
        const [result] = await db.execute(sqlcommand, [encryptedNik, wargaId])
        return result
    } catch (err) {
        console.log("error updateWargaNik:", err)
        return "error karena: " + err
    }
}

/**
 * Update No KK (no_kk) di tabel family.
 * @param {number} familyId - ID family yang no_kk-nya akan diubah
 * @param {string} encryptedNoKk - No KK baru (sudah terenkripsi)
 * @returns {Object} result dari query UPDATE
 */
export async function updateFamilyNoKk(familyId, encryptedNoKk) {
    const sqlcommand = "UPDATE family SET no_kk = ? WHERE id = ?"
    try {
        const [result] = await db.execute(sqlcommand, [encryptedNoKk, familyId])
        return result
    } catch (err) {
        console.log("error updateFamilyNoKk:", err)
        return "error karena: " + err
    }
}


