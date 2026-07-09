import { warganya, getWargas } from "../models/inputwarganya.js";
import { encryptEmails, decryptEmails } from "../helpers/ciihper.js";
import { maskData } from "../utils/masking.js";

export async function warganyain (nik, nama, jenisKelamin, tglLahir, statusHidup, noHp, umur, familyId, houseId){
    try {
        // Enkripsi data sensitif sebelum masuk ke DB
        const encryptedNik      = encryptEmails(String(nik))
        const encryptedTglLahir = encryptEmails(tglLahir)
        const encryptedNoHp     = encryptEmails(String(noHp))

        const hasildbnya = await warganya(encryptedNik, nama, jenisKelamin, encryptedTglLahir, statusHidup, encryptedNoHp, umur, familyId, houseId)
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
