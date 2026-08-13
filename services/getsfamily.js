import dbfamily from "../models/dbfamily.js"
import { decryptEmails } from "../helpers/ciihper.js"
import { maskData } from "../utils/masking.js"
import { calculateAge } from "../helpers/ageCalculator.js"

export default async function family(id) {
    try {
        const hasilnya = await dbfamily(id)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return hasilnya
        }

        const decryptedWarga = hasilnya.map(w => {
            try {
                const decTglLahir = decryptEmails(w.tgl_lahir);
                const realUmur = calculateAge(decTglLahir, w.umur);
                return {
                    ...w,
                    nik: maskData(decryptEmails(w.nik)),
                    tgl_lahir: decTglLahir,
                    no_hp: decryptEmails(w.no_hp),
                    umur: realUmur,
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