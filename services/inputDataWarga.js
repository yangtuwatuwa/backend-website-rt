import { inputWarganya, getWarganya } from "../models/resident.js";
import { encryptEmails, decryptEmails } from "../helpers/ciihper.js";
import { maskData } from "../utils/masking.js";

export async function logicWarganya(noKK, houseId,kepalaKeluarga){
    
    try {
        const nokk = await encryptEmails(noKK)
        const hasilnya = await inputWarganya(nokk, houseId , kepalaKeluarga)
        return hasilnya;
        
    } catch (err) {
        console.log(err)
        return 'error mas ' +  err;
    }
}

export async function listWarganya() {
    try {
        const hasilnya = await getWarganya()
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return hasilnya
        }
        
        const decryptedWarga = hasilnya.map(w => {
            try {
                return {
                    ...w,
                    no_kk: maskData(decryptEmails(w.no_kk)),
                    house_blok: w.house_blok ? decryptEmails(w.house_blok) : null,
                    house_nomor: w.house_nomor ? decryptEmails(w.house_nomor) : null,
                    house_alamat: w.house_alamat ? decryptEmails(w.house_alamat) : null,
                    kepala_keluarga_nik: w.kepala_keluarga_nik ? maskData(decryptEmails(w.kepala_keluarga_nik)) : null,
                    kepala_keluarga_nohp: w.kepala_keluarga_nohp ? decryptEmails(w.kepala_keluarga_nohp) : null
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
