import { warganya, getWargas, getPendingWarga, updateWargaStatus, updateWargaFields } from "../models/inputwarganya.js";
import { encryptEmails, decryptEmails } from "../helpers/ciihper.js";
import { maskData } from "../utils/masking.js";

export async function warganyain (nik, nama, jenisKelamin, tglLahir, statusHidup, noHp, umur, familyId, houseId, status = "diterima"){
    try {
        // Enkripsi data sensitif sebelum masuk ke DB
        const encryptedNik      = encryptEmails(String(nik))
        const encryptedTglLahir = encryptEmails(tglLahir)
        const encryptedNoHp     = encryptEmails(String(noHp))

        const hasildbnya = await warganya(encryptedNik, nama, jenisKelamin, encryptedTglLahir, statusHidup, encryptedNoHp, umur, familyId, houseId, status)
        return hasildbnya;
    } catch (err) {
        return "error input warganya diservice: " + err 
    }
}

export async function listWarga() {
    try {
        const hasilnya = await getWargas()
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return hasilnya
        }
        
        const decryptedWarga = hasilnya.map(w => {
            try {
                return {
                    ...w,
                    nik: maskData(decryptEmails(w.nik)),
                    tgl_lahir: decryptEmails(w.tgl_lahir),
                    no_hp: decryptEmails(w.no_hp),
                    family_nokk: w.family_nokk ? maskData(decryptEmails(w.family_nokk)) : null,
                    house_blok: w.house_blok ? decryptEmails(w.house_blok) : null,
                    house_nomor: w.house_nomor ? decryptEmails(w.house_nomor) : null,
                    house_alamat: w.house_alamat ? decryptEmails(w.house_alamat) : null
                }
            } catch (decErr) {
                return w;
            }
        })
        return decryptedWarga
    } catch (err) {
        console.log(err)
        return 'error mas ' + err;
    }
}

export async function listPendingWarga() {
    try {
        const hasilnya = await getPendingWarga()
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return hasilnya
        }
        
        const decryptedWarga = hasilnya.map(w => {
            try {
                return {
                    ...w,
                    nik: maskData(decryptEmails(w.nik)),
                    tgl_lahir: decryptEmails(w.tgl_lahir),
                    no_hp: decryptEmails(w.no_hp),
                    family_nokk: w.family_nokk ? maskData(decryptEmails(w.family_nokk)) : null,
                    house_blok: w.house_blok ? decryptEmails(w.house_blok) : null,
                    house_nomor: w.house_nomor ? decryptEmails(w.house_nomor) : null,
                    house_alamat: w.house_alamat ? decryptEmails(w.house_alamat) : null
                }
            } catch (decErr) {
                return w;
            }
        })
        return decryptedWarga
    } catch (err) {
        console.log(err)
        return 'error mas ' + err;
    }
}

export async function verifyWarga(id, status) {
    const allowedStatus = ["diterima", "ditolak"]
    if (!allowedStatus.includes(status)) {
        return "error: status harus diterima atau ditolak masbro"
    }

    try {
        const hasildbnya = await updateWargaStatus(id, status)
        return hasildbnya
    } catch (err) {
        console.log(err)
        return "error mas di service: " + err
    }
}

export async function updateWargaService(id, data) {
    const fieldsToUpdate = {};
    if (data.nama !== undefined) fieldsToUpdate.nama = data.nama;
    if (data.jenisKelamin !== undefined) fieldsToUpdate.jenis_kelamin = data.jenisKelamin;
    if (data.tglLahir !== undefined) fieldsToUpdate.tgl_lahir = encryptEmails(data.tglLahir);
    if (data.statusHidup !== undefined) fieldsToUpdate.status_hidup = data.statusHidup;
    if (data.noHp !== undefined) fieldsToUpdate.no_hp = encryptEmails(String(data.noHp));
    if (data.umur !== undefined) fieldsToUpdate.umur = data.umur;

    try {
        const hasilnya = await updateWargaFields(id, fieldsToUpdate);
        return hasilnya;
    } catch (err) {
        console.log(err);
        return "error updateWargaService: " + err;
    }
}
