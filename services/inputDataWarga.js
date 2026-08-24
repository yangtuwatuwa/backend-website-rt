import { getWarganya } from "../models/resident.js";
import { encryptEmails, decryptEmails } from "../helpers/ciihper.js";
import { maskData } from "../utils/masking.js";


export async function listWarganya() {
    try {
        const hasilnya = await getWarganya()
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return hasilnya
        }
        
        const decryptedWarga = hasilnya.map(w => {
            const hasAccountBool = Boolean(w.account_id);
            const decNoKk = decryptEmails(w.no_kk);
            const decNik = w.kepala_keluarga_nik ? decryptEmails(w.kepala_keluarga_nik) : "";
            const decBlok = w.house_blok ? decryptEmails(w.house_blok) : null;
            const decNomor = w.house_nomor ? decryptEmails(w.house_nomor) : null;
            const decAlamat = w.house_alamat ? decryptEmails(w.house_alamat) : null;
            const decNoHp = w.kepala_keluarga_nohp ? decryptEmails(w.kepala_keluarga_nohp) : null;

            return {
                ...w,
                hasAccount: hasAccountBool,
                has_account: hasAccountBool,
                status_akun: hasAccountBool ? "registered" : "unregistered",
                no_kk: decNoKk ? maskData(decNoKk) : null,
                house_blok: decBlok || null,
                house_nomor: decNomor || null,
                house_alamat: decAlamat || null,
                kepala_keluarga_nik: decNik ? maskData(decNik) : null,
                kepala_keluarga_nohp: decNoHp || null
            };
        })
        return decryptedWarga
    } catch (err) {
        console.log(err)
        return 'error mas ' + err;
    }
}
