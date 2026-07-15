import { createAgenda, getAgendas, getAgendaById, updateAgenda, deleteAgenda } from "../models/agenda.js"

export async function addAgenda(kategori, judul, deskripsi, tanggal, waktu, tempat) {
    try {
        if (!kategori) return "error: kategori tidak boleh kosong masbro"
        if (!judul) return "error: judul tidak boleh kosong masbro"
        if (!tanggal) return "error: tanggal tidak boleh kosong masbro"
        if (!waktu) return "error: waktu tidak boleh kosong masbro"
        if (!tempat) return "error: tempat tidak boleh kosong masbro"
        
        const result = await createAgenda(kategori, judul, deskripsi || "", tanggal, waktu, tempat)
        return result
    } catch (err) {
        console.log("error di service addAgenda:", err)
        return "error mas di service: " + err
    }
}

export async function listAllAgendas(search = "") {
    try {
        const result = await getAgendas(search)
        return result
    } catch (err) {
        console.log("error di service listAllAgendas:", err)
        return "error mas di service: " + err
    }
}

export async function editAgenda(id, dataToUpdate) {
    try {
        const existing = await getAgendaById(id)
        if (!existing || existing === "error") {
            return "error: agenda tidak ditemukan mas"
        }
        
        // Bersihkan properties yang undefined
        const cleanData = {}
        const allowedKeys = ["kategori", "judul", "deskripsi", "tanggal", "waktu", "tempat"]
        allowedKeys.forEach(key => {
            if (dataToUpdate[key] !== undefined) {
                cleanData[key] = dataToUpdate[key]
            }
        })
        
        if (Object.keys(cleanData).length === 0) {
            return "error: tidak ada data baru yang dikirim untuk diupdate"
        }
        
        const result = await updateAgenda(id, cleanData)
        return result
    } catch (err) {
        console.log("error di service editAgenda:", err)
        return "error mas di service: " + err
    }
}

export async function removeAgenda(id) {
    try {
        const existing = await getAgendaById(id)
        if (!existing || existing === "error") {
            return "error: agenda tidak ditemukan mas"
        }
        
        const result = await deleteAgenda(id)
        return result
    } catch (err) {
        console.log("error di service removeAgenda:", err)
        return "error mas di service: " + err
    }
}
