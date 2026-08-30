import { warganya, getWargas, getPendingWarga, updateWargaStatus, updateWargaFields } from "../models/inputwarganya.js";
import { encryptEmails, decryptEmails } from "../helpers/ciihper.js";
import { maskData } from "../utils/masking.js";
import { calculateAge } from "../helpers/ageCalculator.js";

export async function warganyain (nik, nama, jenisKelamin, tglLahir, statusHidup, noHp, umur, familyId, houseId, status = "diterima", isKepalaKeluarga = false, executor = undefined){
    try {
        // Enkripsi data sensitif sebelum masuk ke DB
        const encryptedNik      = encryptEmails(String(nik))
        const encryptedTglLahir = encryptEmails(tglLahir)
        const encryptedNoHp     = encryptEmails(String(noHp))

        // Hitung umur otomatis dari tglLahir jika tidak dikirim atau untuk konsistensi
        const finalUmur = calculateAge(tglLahir, umur);

        const hasildbnya = await warganya(encryptedNik, nama, jenisKelamin, encryptedTglLahir, statusHidup, encryptedNoHp, finalUmur, familyId, houseId, status, isKepalaKeluarga, executor)
        return hasildbnya;
    } catch (err) {
        return "error input warganya diservice: " + err 
    }
}

export async function listWarga(executor = undefined) {
    try {
        const hasilnya = await getWargas(executor)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return hasilnya
        }
        
        const decryptedWarga = hasilnya.map(w => {
            const decNik = decryptEmails(w.nik);
            const decTglLahir = decryptEmails(w.tgl_lahir);
            const decNoHp = decryptEmails(w.no_hp);
            const decFamilyNoKk = w.family_nokk ? decryptEmails(w.family_nokk) : "";
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
                family_nokk: decFamilyNoKk ? maskData(decFamilyNoKk) : null,
                house_blok: decBlok || null,
                house_nomor: decNomor || null,
                house_alamat: decAlamat || null
            };
        })
        return decryptedWarga
    } catch (err) {
        console.log(err)
        return 'error mas ' + err;
    }
}

export async function listPendingWarga(executor = undefined) {
    try {
        const hasilnya = await getPendingWarga(executor)
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return hasilnya
        }
        
        const decryptedWarga = hasilnya.map(w => {
            const docId = w.ktp_document_id || null;
            const decNik = decryptEmails(w.nik);
            const decTglLahir = decryptEmails(w.tgl_lahir);
            const decNoHp = decryptEmails(w.no_hp);
            const decFamilyNoKk = w.family_nokk ? decryptEmails(w.family_nokk) : "";
            const decBlok = w.house_blok ? decryptEmails(w.house_blok) : null;
            const decNomor = w.house_nomor ? decryptEmails(w.house_nomor) : null;
            const decAlamat = w.house_alamat ? decryptEmails(w.house_alamat) : null;
            const realUmur = decTglLahir ? calculateAge(decTglLahir, w.umur) : w.umur;
            const docType = w.document_type || (realUmur < 17 ? 'kia' : 'ktp');
            const docUrl = docId ? `/resident/sensitifdata/file/${docId}` : `/admin/warga/${w.warga_id || w.id}/ktp`;

            return {
                ...w,
                nik: decNik ? maskData(decNik) : null,
                tgl_lahir: decTglLahir || null,
                no_hp: decNoHp || null,
                umur: realUmur,
                family_nokk: decFamilyNoKk ? maskData(decFamilyNoKk) : null,
                house_blok: decBlok || null,
                house_nomor: decNomor || null,
                house_alamat: decAlamat || null,
                document_id: docId,
                document_type: docType,
                document_url: docUrl,
                ktp_document_id: docId,
                ktp_url: docUrl,
                has_ktp: Boolean(docId),
                has_document: Boolean(docId)
            };
        })
        return decryptedWarga
    } catch (err) {
        console.log(err)
        return 'error mas ' + err;
    }
}


export async function verifyWarga(id, status, executor = undefined) {
    const allowedStatus = ["diterima", "ditolak"]
    if (!allowedStatus.includes(status)) {
        return "error: status harus diterima atau ditolak masbro"
    }

    try {
        const hasildbnya = await updateWargaStatus(id, status, executor)
        return hasildbnya
    } catch (err) {
        console.log(err)
        return "error mas di service: " + err
    }
}

export async function updateWargaService(id, data, executor = undefined) {
    const fieldsToUpdate = {};
    if (data.nama !== undefined) fieldsToUpdate.nama = data.nama;
    if (data.jenisKelamin !== undefined) fieldsToUpdate.jenis_kelamin = data.jenisKelamin;
    if (data.tglLahir !== undefined) {
        fieldsToUpdate.tgl_lahir = encryptEmails(data.tglLahir);
        fieldsToUpdate.umur = calculateAge(data.tglLahir, data.umur);
    } else if (data.umur !== undefined) {
        fieldsToUpdate.umur = data.umur;
    }
    if (data.statusHidup !== undefined) fieldsToUpdate.status_hidup = data.statusHidup;
    if (data.noHp !== undefined) fieldsToUpdate.no_hp = encryptEmails(String(data.noHp));

    try {
        const hasilnya = await updateWargaFields(id, fieldsToUpdate, executor);
        return hasilnya;
    } catch (err) {
        console.log(err);
        return "error updateWargaService: " + err;
    }
}

export async function searchWargaService(searchQuery, executor = undefined) {
    try {
        const query = String(searchQuery).toLowerCase().trim()
        if (!query) {
            return []
        }

        const allWargas = await getWargas(executor)
        if (typeof allWargas === "string" && allWargas.startsWith("error")) {
            return allWargas
        }

        const results = []
        for (const w of allWargas) {
            const decNik = decryptEmails(w.nik)
            const decTglLahir = decryptEmails(w.tgl_lahir)
            const decNoHp = decryptEmails(w.no_hp)
            const decKk = w.family_nokk ? decryptEmails(w.family_nokk) : ""
            const decBlok = w.house_blok ? decryptEmails(w.house_blok) : ""
            const decNomor = w.house_nomor ? decryptEmails(w.house_nomor) : ""
            const decAlamat = w.house_alamat ? decryptEmails(w.house_alamat) : ""
            const realUmur = decTglLahir ? calculateAge(decTglLahir, w.umur) : w.umur;

            const matches =
                (w.nama && w.nama.toLowerCase().includes(query)) ||
                (decNik && decNik.toLowerCase().includes(query)) ||
                (decKk && decKk.toLowerCase().includes(query)) ||
                (decBlok && decBlok.toLowerCase().includes(query)) ||
                (decNomor && decNomor.toLowerCase().includes(query)) ||
                (decAlamat && decAlamat.toLowerCase().includes(query)) ||
                (w.status_hidup && w.status_hidup.toLowerCase().includes(query));

            if (matches) {
                results.push({
                    ...w,
                    nik: decNik ? maskData(decNik) : null,
                    tgl_lahir: decTglLahir || null,
                    no_hp: decNoHp || null,
                    umur: realUmur,
                    family_nokk: decKk ? maskData(decKk) : null,
                    house_blok: decBlok || null,
                    house_nomor: decNomor || null,
                    house_alamat: decAlamat || null
                })
            }
        }
        return results
    } catch (err) {
        console.log("error searchWargaService:", err)
        return "error mas " + err
    }
}
