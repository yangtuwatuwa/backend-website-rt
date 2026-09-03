import {
    KasTransaksiError,
    closeKasPeriodService,
    getKasClosingHistoryService,
    getKasReportSummaryService,
    catatPemasukanKasService,
    catatPengeluaranKasService,
    deleteKasTransaksiService,
    getKasMonthlyReportService,
    getKasRecapService,
    getKasSummaryService,
    getKasTransaksiListService,
    getKasTransactionsForExportService,
    getKasYearlyReportService,
    getSuggestedKasCategoriesService,
    updateKasTransaksiService,
} from "../services/kasTransaksiService.js";
import { buildKasExcelBuffer, buildKasPdfBuffer } from "../utils/kasExport.js";
import { emitSyncEvent } from "../utils/socket.js";

function actorFromRequest(req) {
    return {
        actorId: req.user.id,
        actorUsername: req.user.username,
        actorRole: req.user.role,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
    };
}

function success(res, status, data, message) {
    return res.status(status).json({
        response: status,
        output: { pesan: data, token: null },
        message,
    });
}

function handleError(res, error) {
    if (error instanceof KasTransaksiError) {
        return res.status(error.status).json({ pesan: error.message, code: error.code, details: error.details });
    }
    console.error("[KasTransaksiController]", error);
    return res.status(500).json({ pesan: "Terjadi kesalahan saat memproses Kas RT." });
}

export async function catatPemasukanKasController(req, res) {
    try {
        const result = await catatPemasukanKasService(req.body, actorFromRequest(req));
        emitSyncEvent("finance");
        return success(res, 201, result, "Pemasukan Kas RT berhasil dicatat.");
    } catch (error) { return handleError(res, error); }
}

export async function catatPengeluaranKasController(req, res) {
    try {
        const result = await catatPengeluaranKasService(req.body, actorFromRequest(req));
        emitSyncEvent("finance");
        return success(res, 201, result, "Pengeluaran Kas RT berhasil dicatat.");
    } catch (error) { return handleError(res, error); }
}

export async function updateKasTransaksiController(req, res) {
    try {
        const result = await updateKasTransaksiService(req.params.id, req.body, actorFromRequest(req));
        emitSyncEvent("finance");
        return success(res, 200, result, "Transaksi Kas RT berhasil diperbarui.");
    } catch (error) { return handleError(res, error); }
}

export async function deleteKasTransaksiController(req, res) {
    try {
        const result = await deleteKasTransaksiService(req.params.id, actorFromRequest(req));
        emitSyncEvent("finance");
        return success(res, 200, result, "Transaksi Kas RT berhasil dihapus.");
    } catch (error) { return handleError(res, error); }
}

export async function listKasTransaksiController(req, res) {
    try { return success(res, 200, await getKasTransaksiListService(req.query), "Daftar transaksi Kas RT berhasil diambil."); }
    catch (error) { return handleError(res, error); }
}

export async function getKasSummaryController(req, res) {
    try { return success(res, 200, await getKasSummaryService(req.query), "Ringkasan Kas RT berhasil dihitung."); }
    catch (error) { return handleError(res, error); }
}

export async function closeKasPeriodController(req, res) {
    try {
        const result = await closeKasPeriodService(req.body, actorFromRequest(req));
        emitSyncEvent("finance");
        return success(res, 201, result, "Periode Kas RT berhasil ditutup.");
    } catch (error) { return handleError(res, error); }
}

export async function getKasClosingHistoryController(req, res) {
    try { return success(res, 200, await getKasClosingHistoryService(req.query), "Riwayat tutup buku berhasil diambil."); }
    catch (error) { return handleError(res, error); }
}

export async function getKasMonthlyReportController(req, res) {
    try { return success(res, 200, await getKasMonthlyReportService(req.query), "Laporan bulanan Kas RT berhasil dibuat."); }
    catch (error) { return handleError(res, error); }
}

export async function getKasYearlyReportController(req, res) {
    try { return success(res, 200, await getKasYearlyReportService(req.query), "Laporan tahunan Kas RT berhasil dibuat."); }
    catch (error) { return handleError(res, error); }
}

export async function getKasRecapController(req, res) {
    try { return success(res, 200, await getKasRecapService(req.query), "Rekap kategori Kas RT berhasil dibuat."); }
    catch (error) { return handleError(res, error); }
}

export function getKasSuggestedCategoriesController(_req, res) {
    return success(res, 200, getSuggestedKasCategoriesService(), "Daftar saran kategori Kas RT berhasil diambil.");
}

async function exportData(req, res, disposition, forcedFormat = undefined) {
    const format = String(forcedFormat ?? req.query.format ?? "pdf").toLowerCase();
    if (!['pdf', 'xlsx', 'excel'].includes(format)) {
        throw new KasTransaksiError(400, "INVALID_EXPORT_FORMAT", "format ekspor harus pdf atau xlsx.");
    }
    const [transactions, summary] = await Promise.all([
        getKasTransactionsForExportService(req.query),
        getKasReportSummaryService(req.query),
    ]);
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "xlsx" || format === "excel") {
        const buffer = await buildKasExcelBuffer({ transactions, summary });
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `${disposition}; filename=kas-rt-${stamp}.xlsx`);
        return res.send(buffer);
    }
    const buffer = await buildKasPdfBuffer({ transactions, summary, filters: req.query });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `${disposition}; filename=kas-rt-${stamp}.pdf`);
    return res.send(buffer);
}

export async function exportKasController(req, res) {
    try { return await exportData(req, res, "attachment"); }
    catch (error) { return handleError(res, error); }
}

export async function printKasReportController(req, res) {
    try {
        return await exportData(req, res, "inline", "pdf");
    } catch (error) { return handleError(res, error); }
}
