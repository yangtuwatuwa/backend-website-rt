import {
    SuratPengajuanError,
    approveSuratPengajuanService,
    createSuratKategoriService,
    createSuratPengajuanService,
    getSuratPengajuanDetailService,
    listSuratKategoriService,
    listSuratPengajuanService,
    rejectSuratPengajuanService,
} from "../services/suratPengajuanService.js";
import { emitSyncEvent } from "../utils/socket.js";

function actorFromRequest(req) {
    return { id: req.user.id, role: req.user.role };
}

function success(res, status, data, message) {
    return res.status(status).json({
        response: status,
        output: { pesan: data, token: null },
        message,
    });
}

export function handleSuratPengajuanError(res, error) {
    if (error instanceof SuratPengajuanError) {
        return res.status(error.status).json({ pesan: error.message, code: error.code, details: error.details });
    }
    console.error("[SuratPengajuanController]", error);
    return res.status(500).json({ pesan: "Terjadi kesalahan saat memproses pengajuan surat." });
}

export async function createSuratPengajuanController(req, res) {
    try {
        const result = await createSuratPengajuanService(req.body, actorFromRequest(req));
        emitSyncEvent("pengajuan");
        return success(res, 201, result, "Pengajuan surat berhasil dikirim.");
    } catch (error) { return handleSuratPengajuanError(res, error); }
}

export async function listSuratPengajuanController(req, res) {
    try {
        return success(res, 200, await listSuratPengajuanService(req.query, actorFromRequest(req)), "Daftar pengajuan surat berhasil diambil.");
    } catch (error) { return handleSuratPengajuanError(res, error); }
}

export async function getSuratPengajuanDetailController(req, res) {
    try {
        return success(res, 200, await getSuratPengajuanDetailService(req.params.id, actorFromRequest(req)), "Detail pengajuan surat berhasil diambil.");
    } catch (error) { return handleSuratPengajuanError(res, error); }
}

export async function approveSuratPengajuanController(req, res) {
    try {
        const result = await approveSuratPengajuanService(req.params.id, actorFromRequest(req));
        emitSyncEvent("pengajuan");
        return success(res, 200, result, "Pengajuan surat berhasil disetujui.");
    } catch (error) { return handleSuratPengajuanError(res, error); }
}

export async function rejectSuratPengajuanController(req, res) {
    try {
        const result = await rejectSuratPengajuanService(req.params.id, actorFromRequest(req));
        emitSyncEvent("pengajuan");
        return success(res, 200, result, "Pengajuan surat berhasil ditolak.");
    } catch (error) { return handleSuratPengajuanError(res, error); }
}

export async function listSuratKategoriController(req, res) {
    try {
        return success(res, 200, await listSuratKategoriService(actorFromRequest(req)), "Daftar kategori surat aktif berhasil diambil.");
    } catch (error) { return handleSuratPengajuanError(res, error); }
}

export async function createSuratKategoriController(req, res) {
    try {
        const result = await createSuratKategoriService(req.body, actorFromRequest(req));
        emitSyncEvent("surat_kategori");
        return success(res, 201, result, "Kategori surat berhasil ditambahkan.");
    } catch (error) { return handleSuratPengajuanError(res, error); }
}
