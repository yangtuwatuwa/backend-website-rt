import { warganya, getWargas, getPendingWarga, updateWargaStatus, updateWargaFields } from "../models/inputwarganya.js";
import { encryptEmails, decryptEmails } from "../helpers/ciihper.js";
import { maskData } from "../utils/masking.js";
import { calculateAge } from "../helpers/ageCalculator.js";

export async function warganyain (nik, nama, jenisKelamin, tglLahir, statusHidup, noHp, umur, familyId, houseId, status = "diterima", isKepalaKeluarga = false){
    try {
        // Enkripsi data sensitif sebelum masuk ke DB
        const encryptedNik      = encryptEmails(String(nik))
        const encryptedTglLahir = encryptEmails(tglLahir)
        const encryptedNoHp     = encryptEmails(String(noHp))

        // Hitung umur otomatis dari tglLahir jika tidak dikirim atau untuk konsistensi
        const finalUmur = calculateAge(tglLahir, umur);

        const hasildbnya = await warganya(encryptedNik, nama, jenisKelamin, encryptedTglLahir, statusHidup, encryptedNoHp, finalUmur, familyId, houseId, status, isKepalaKeluarga)
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
                const decTglLahir = decryptEmails(w.tgl_lahir);
                const realUmur = calculateAge(decTglLahir, w.umur);
                return {
                    ...w,
                    nik: maskData(decryptEmails(w.nik)),
                    tgl_lahir: decTglLahir,
                    no_hp: decryptEmails(w.no_hp),
                    umur: realUmur,
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

export async function listPendingWarga() {
    try {
        const hasilnya = await getPendingWarga()
        if (typeof hasilnya === "string" && hasilnya.startsWith("error")) {
            return hasilnya
        }
        
        const decryptedWarga = hasilnya.map(w => {
            try {
                const docId = w.ktp_document_id || null;
                const decTglLahir = decryptEmails(w.tgl_lahir);
                const realUmur = calculateAge(decTglLahir, w.umur);
                const docType = w.document_type || (realUmur < 17 ? 'kia' : 'ktp');
                const docUrl = docId ? `/resident/sensitifdata/file/${docId}` : `/admin/warga/${w.warga_id || w.id}/ktp`;
                return {
                    ...w,
                    nik: maskData(decryptEmails(w.nik)),
                    raw_nik: decryptEmails(w.nik),
                    tgl_lahir: decTglLahir,
                    no_hp: decryptEmails(w.no_hp),
                    umur: realUmur,
                    family_nokk: w.family_nokk ? maskData(decryptEmails(w.family_nokk)) : null,
                    house_blok: w.house_blok ? decryptEmails(w.house_blok) : null,
                    house_nomor: w.house_nomor ? decryptEmails(w.house_nomor) : null,
                    house_alamat: w.house_alamat ? decryptEmails(w.house_alamat) : null,
                    document_id: docId,
                    document_type: docType,
                    document_url: docUrl,
                    ktp_document_id: docId,
                    ktp_url: docUrl,
                    has_ktp: Boolean(docId),
                    has_document: Boolean(docId)
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


export async function verifyWarga(id, status) {
    const allowedStatus = ["diterima", "ditolak"]
    if (!allowedStatus.includes(status)) {
        return "error: status harus diterima atau ditolak masbro"
    }

    try {
        const hasildbnya = await updateWargaStatus(id, status)
        return hasildbnya
    } catch (err) {
        console.log(err)
        return "error mas di service: " + err
    }
}

export async function updateWargaService(id, data) {
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
        const hasilnya = await updateWargaFields(id, fieldsToUpdate);
        return hasilnya;
    } catch (err) {
        console.log(err);
        return "error updateWargaService: " + err;
    }
}

export async function searchWargaService(searchQuery) {
    try {
        const query = String(searchQuery).toLowerCase().trim()
        if (!query) {
            return []
        }

        const allWargas = await getWargas()
        if (typeof allWargas === "string" && allWargas.startsWith("error")) {
            return allWargas
        }

        const results = []
        for (const w of allWargas) {
            try {
                const decNik = decryptEmails(w.nik)
                const decTglLahir = decryptEmails(w.tgl_lahir)
                const decNoHp = decryptEmails(w.no_hp)
                const decKk = w.family_nokk ? decryptEmails(w.family_nokk) : ""
                const decBlok = w.house_blok ? decryptEmails(w.house_blok) : ""
                const decNomor = w.house_nomor ? decryptEmails(w.house_nomor) : ""
                const decAlamat = w.house_alamat ? decryptEmails(w.house_alamat) : ""
                const realUmur = calculateAge(decTglLahir, w.umur);

                const matches =
                    w.nama.toLowerCase().includes(query) ||
                    decNik.toLowerCase().includes(query) ||
                    decKk.toLowerCase().includes(query) ||
                    decBlok.toLowerCase().includes(query) ||
                    decNomor.toLowerCase().includes(query) ||
                    decAlamat.toLowerCase().includes(query) ||
                    w.status_hidup.toLowerCase().includes(query)

                if (matches) {
                    results.push({
                        ...w,
                        nik: maskData(decNik),
                        tgl_lahir: decTglLahir,
                        no_hp: decNoHp,
                        umur: realUmur,
                        family_nokk: w.family_nokk ? maskData(decKk) : null,
                        house_blok: w.house_blok ? decBlok : null,
                        house_nomor: w.house_nomor ? decNomor : null,
                        house_alamat: w.house_alamat ? decAlamat : null
                    })
                }
            } catch (decErr) {
                if (
                    w.nama.toLowerCase().includes(query) ||
                    w.status_hidup.toLowerCase().includes(query)
                ) {
                    results.push(w)
                }
            }
        }
        return results
    } catch (err) {
        console.log("error searchWargaService:", err)
        return "error mas " + err
    }
}
