import dbfamily from "../models/dbfamily.js"
import { decryptEmails } from "../helpers/ciihper.js"
import { maskData } from "../utils/masking.js"

export default async function family(id) {
    try {
        const hasilnya = await dbfamily(id)
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
                    house_blok: w.house_blok ? decryptEmails(w.house_blok) : null,
                    house_nomor: w.house_nomor ? decryptEmails(w.house_nomor) : null,
                    house_alamat: w.house_alamat ? decryptEmails(w.house_alamat) : null
                }
            } catch (decErr) {
                return w;
            }
        })
        return decryptedWarga;
    } catch (err) {
        console.log(err)
        return "error karena: " + err
    }
}