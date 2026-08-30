import { getHouses } from "../models/houseWarga.js";
import { decryptEmails } from "../helpers/ciihper.js";


export async function listRumah(executor = undefined) {
    try {
        const hasilnya = await getHouses(executor)
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


