import {
    submitKasContributionService,
    verifyKasContributionService,
    getPendingKasContributionsService,
    getMyKasHistoryService,
    getKasAuditService
} from "../services/kasService.js";
import { getAccountById } from "../models/login.js";
import { responseSucces } from "../utils/response.js";
import { emitSyncEvent } from "../utils/socket.js";

/**
 * Warga Mengunggah Bukti Pembayaran / Sumbangan Kas RT
 * Route: POST /resident/kas/contribute
 */
export async function contributeKasController(req, res) {
    const userId = req.user.id;
    const { amount, category, description, channel } = req.body;

    if (!req.file && (!channel || channel === "transfer")) {
        return res.status(400).json({ pesan: "Bukti transfer pembayaran (file) wajib diunggah masbro!" });
    }

    const allowed = ["kematian", "sosial", "kegiatan", "lainnya"];
    if (!allowed.includes(String(category || "").toLowerCase().trim())) {
        return res.status(400).json({ pesan: "Kategori kas tidak valid. Pilihan: kematian, sosial, kegiatan, lainnya" });
    }

    try {
        const dataUser = await getAccountById(userId);
        if (!dataUser || dataUser.length === 0) {
            return res.status(404).json({ pesan: "Akun warga tidak ditemukan" });
        }

        const familyId = dataUser[0].family_id;
        if (!familyId) {
            return res.status(400).json({ pesan: "Akun anda belum terikat dengan Kartu Keluarga mana pun" });
        }

        // Cari resident_id warga
        const residentId = dataUser[0].id; // Fallback jika tidak ada link langsung
        const proofUrl = req.file ? req.file.filename : null;

        const result = await submitKasContributionService({
            residentId,
            amount: parseFloat(amount),
            category,
            description: description || "-",
            channel: channel || "transfer",
            proofUrl,
            recordedBy: userId
        });

        if (result.error) {
            return res.status(400).json({ pesan: result.error });
        }

        emitSyncEvent("finance");
        return responseSucces(201, result, result.message, res);
    } catch (err) {
        console.error("[Controller Error contributeKasController]:", err);
        return res.status(500).json({ pesan: "Terjadi kesalahan pada server: " + err.message });
    }
}

/**
 * Bendahara Memverifikasi Bukti Iuran Kas (Approve / Reject)
 * Route: PATCH /admin/finance/kas-contributions/:id/verify
 */
export async function verifyKasContributionController(req, res) {
    const { id } = req.params;
    const { decision, status, rejectReason, reject_reason, alasan } = req.body;
    const actorId = req.user.id;

    let targetDecision = decision || status;
    if (targetDecision === 'diterima') targetDecision = 'approved';
    if (targetDecision === 'ditolak') targetDecision = 'rejected';

    const targetRejectReason = rejectReason || reject_reason || alasan;

    try {
        const result = await verifyKasContributionService({
            contributionId: id,
            decision: targetDecision,
            actorId,
            rejectReason: targetRejectReason
        });

        if (result.error) {
            return res.status(400).json({ pesan: result.error });
        }

        emitSyncEvent("finance");
        return responseSucces(200, result, result.message, res);
    } catch (err) {
        console.error("[Controller Error verifyKasContributionController]:", err);
        return res.status(500).json({ pesan: "Terjadi kesalahan pada server: " + err.message });
    }
}

/**
 * Daftar Iuran Kas yang Menunggu Verifikasi Bendahara
 * Route: GET /admin/finance/kas-contributions/pending
 */
export async function getPendingKasContributionsController(req, res) {
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    try {
        const list = await getPendingKasContributionsService({
            limit: parseInt(limit),
            offset
        });

        if (list.error) {
            return res.status(400).json({ pesan: list.error });
        }

        return responseSucces(200, list, "Daftar pending iuran kas berhasil diambil", res);
    } catch (err) {
        console.error("[Controller Error getPendingKasContributionsController]:", err);
        return res.status(500).json({ pesan: "Terjadi kesalahan pada server: " + err.message });
    }
}

/**
 * Riwayat Iuran Kas Keluarga Warga Sendiri
 * Route: GET /resident/kas/history
 */
export async function getMyKasContributionsController(req, res) {
    const userId = req.user.id;

    try {
        const list = await getMyKasHistoryService(userId);
        if (list.error) {
            return res.status(400).json({ pesan: list.error });
        }

        return responseSucces(200, list, "Riwayat iuran kas keluarga berhasil diambil", res);
    } catch (err) {
        console.error("[Controller Error getMyKasContributionsController]:", err);
        return res.status(500).json({ pesan: "Terjadi kesalahan pada server: " + err.message });
    }
}

/**
 * Audit Trail Iuran Kas untuk RT & Bendahara
 * Route: GET /admin/finance/kas-contributions/audit
 */
export async function getKasAuditController(req, res) {
    const { category, status, channel, page = 1, limit = 100 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    try {
        const list = await getKasAuditService({
            category,
            status,
            channel,
            limit: parseInt(limit),
            offset
        });

        if (list.error) {
            return res.status(400).json({ pesan: list.error });
        }

        return responseSucces(200, list, "Audit trail iuran kas berhasil diambil", res);
    } catch (err) {
        console.error("[Controller Error getKasAuditController]:", err);
        return res.status(500).json({ pesan: "Terjadi kesalahan pada server: " + err.message });
    }
}
