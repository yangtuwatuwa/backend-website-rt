import {
    NotulenRapatError,
    addNotulenRapat,
    editNotulenRapat,
    getNotulenRapatDetail,
    listAllNotulenRapat,
    removeNotulenRapat,
} from "../services/notulenRapat.js";
import { responseSucces } from "../utils/response.js";
import { emitSyncEvent } from "../utils/socket.js";

function handleError(res, error) {
    if (error instanceof NotulenRapatError) {
        return res.status(error.status).json({
            pesan: error.message,
            code: error.code,
            details: error.details,
        });
    }
    console.error("[NotulenRapatController]", error);
    return res.status(500).json({ pesan: "Terjadi kesalahan saat memproses notulen rapat." });
}

export async function createNotulenRapatController(req, res) {
    const { tanggal_rapat, topik, hasil_keputusan } = req.body;
    try {
        const result = await addNotulenRapat(tanggal_rapat, topik, hasil_keputusan);
        emitSyncEvent("notulen_rapat");
        res.status(201);
        return responseSucces(201, result, "Notulen rapat berhasil dibuat.", res);
    } catch (error) { return handleError(res, error); }
}

export async function getNotulenRapatController(req, res) {
    try {
        return responseSucces(200, await listAllNotulenRapat(req.query), "Daftar notulen rapat berhasil diambil.", res);
    } catch (error) { return handleError(res, error); }
}

export async function getNotulenRapatDetailController(req, res) {
    try {
        return responseSucces(200, await getNotulenRapatDetail(req.params.id), "Detail notulen rapat berhasil diambil.", res);
    } catch (error) { return handleError(res, error); }
}

export async function editNotulenRapatController(req, res) {
    try {
        const result = await editNotulenRapat(req.params.id, req.body);
        emitSyncEvent("notulen_rapat");
        return responseSucces(200, result, "Notulen rapat berhasil diperbarui.", res);
    } catch (error) { return handleError(res, error); }
}

export async function removeNotulenRapatController(req, res) {
    try {
        const result = await removeNotulenRapat(req.params.id);
        emitSyncEvent("notulen_rapat");
        return responseSucces(200, result, "Notulen rapat berhasil dihapus.", res);
    } catch (error) { return handleError(res, error); }
}
