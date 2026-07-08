import { inputWarganya, getWarganya } from "../models/resident.js";
import { encryptEmails, decryptEmails } from "../helpers/ciihper.js";

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
                    no_kk: decryptEmails(w.no_kk)
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
