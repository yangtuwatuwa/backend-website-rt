// Compatibility controllers untuk endpoint lama /resident/pengajuan dan
// /admin/pengajuan. Semua operasi memakai implementasi surat-pengajuan baru.
import {
    SuratPengajuanError,
    approveSuratPengajuanService,
    archiveSuratPengajuanService,
    createSuratPengajuanService,
    listMySuratPengajuanService,
    listSuratPengajuanService,
    rejectSuratPengajuanService,
} from "../services/suratPengajuanService.js";
import { handleSuratPengajuanError } from "./suratPengajuanController.js";
import { emitSyncEvent } from "../utils/socket.js";

function actor(req) { return { id: req.user.id, role: req.user.role }; }
function success(res, status, data, message) {
    return res.status(status).json({ response: status, output: { pesan: data, token: null }, message });
}

export async function addPengajuan(req, res) {
    try {
        const result = await createSuratPengajuanService(req.body, actor(req));
        emitSyncEvent("pengajuan");
        return success(res, 201, result, "Pengajuan surat berhasil dikirim.");
    } catch (error) { return handleSuratPengajuanError(res, error); }
}

export async function checkStatusPengajuan(req, res) {
    try {
        return success(res, 200, await listMySuratPengajuanService(req.query, actor(req)), "Daftar pengajuan surat keluarga berhasil diambil.");
    } catch (error) { return handleSuratPengajuanError(res, error); }
}

export async function reviewPengajuan(req, res) {
    try {
        return success(res, 200, await listSuratPengajuanService(req.query, actor(req)), "Daftar pengajuan surat berhasil diambil.");
    } catch (error) { return handleSuratPengajuanError(res, error); }
}

export async function approvePengajuan(req, res) {
    try {
        const status = String(req.body?.status ?? "").trim().toLowerCase();
        let result;
        if (status === "disetujui") result = await approveSuratPengajuanService(req.params.id, actor(req));
        else if (status === "ditolak") result = await rejectSuratPengajuanService(req.params.id, actor(req));
        else throw new SuratPengajuanError(400, "INVALID_STATUS", "status endpoint lama harus disetujui atau ditolak.");
        emitSyncEvent("pengajuan");
        return success(res, 200, result, "Status pengajuan surat berhasil diperbarui.");
    } catch (error) { return handleSuratPengajuanError(res, error); }
}

export async function archivePengajuanController(req, res) {
    try {
        const raw = req.body?.is_archived ?? req.body?.isArchived ?? req.body?.archived;
        const isArchived = raw === undefined ? true : raw;
        const result = await archiveSuratPengajuanService(req.params.id, isArchived, actor(req));
        emitSyncEvent("pengajuan");
        return success(res, 200, result, `Pengajuan surat berhasil ${isArchived ? "diarsipkan" : "diaktifkan kembali"}.`);
    } catch (error) { return handleSuratPengajuanError(res, error); }
}
