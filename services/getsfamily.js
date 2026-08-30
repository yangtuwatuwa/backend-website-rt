import dbfamily from "../models/dbfamily.js"
import { decryptEmails } from "../helpers/ciihper.js"
import { maskData } from "../utils/masking.js"
import { calculateAge } from "../helpers/ageCalculator.js"

export default async function family(id, executor = undefined) {
    try {
        const hasilnya = await dbfamily(id, executor)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return hasilnya
        }

        const decryptedWarga = hasilnya.map(w => {
            const decNik = decryptEmails(w.nik);
            const decTglLahir = decryptEmails(w.tgl_lahir);
            const decNoHp = decryptEmails(w.no_hp);
            const decBlok = w.house_blok ? decryptEmails(w.house_blok) : null;
            const decNomor = w.house_nomor ? decryptEmails(w.house_nomor) : null;
            const decAlamat = w.house_alamat ? decryptEmails(w.house_alamat) : null;
            const realUmur = decTglLahir ? calculateAge(decTglLahir, w.umur) : w.umur;

            return {
                ...w,
                nik: decNik ? maskData(decNik) : null,
                tgl_lahir: decTglLahir || null,
                no_hp: decNoHp || null,
                umur: realUmur,
                house_blok: decBlok || null,
                house_nomor: decNomor || null,
                house_alamat: decAlamat || null
            };
        })
        return decryptedWarga;
    } catch (err) {
        console.log(err)
        return "error karena: " + err
    }
}
