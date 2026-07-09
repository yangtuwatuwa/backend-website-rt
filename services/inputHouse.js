import inputHouse, { getHouses } from "../models/houseWarga.js";
import { encryptEmails, decryptEmails } from "../helpers/ciihper.js";

export async function inputWarga (blok, nomor, alamat, status) {
    try {
        // Enkripsi data sensitif sebelum masuk ke DB
        const encryptedBlok   = encryptEmails(blok)
        const encryptedNomor  = encryptEmails(String(nomor))
        const encryptedAlamat = encryptEmails(alamat)

        const inputRumahRumahan = await inputHouse(encryptedBlok, encryptedNomor, encryptedAlamat, status)
        return inputRumahRumahan
    } catch (error) {
        return "error salah di inputHouse: " + error
    }
}

export async function listRumah() {
    try {
        const hasilnya = await getHouses()
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return hasilnya
        }
        
        const decryptedHouse = hasilnya.map(h => {
            try {
                return {
                    ...h,
                    blok: decryptEmails(h.blok),
                    nomor: decryptEmails(h.nomor),
                    alamat: decryptEmails(h.alamat)
                }
            } catch (decErr) {
                return h;
            }
        })
        return decryptedHouse
    } catch (err) {
        console.log(err)
        return 'error mas ' + err;
    }
}
