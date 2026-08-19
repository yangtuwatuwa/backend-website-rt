import {
    createBillPeriodService,
    getAllBillPeriodsService,
    getBillPeriodDetailService,
    publishBillPeriodService,
    submitPaymentService,
    verifyPaymentService,
    setExemptService,
    getPeriodSummaryService,
    getMyBillsService,
    getBillDetailWithAuthService,
    getPendingPaymentsService,
    getPaymentAuditService
} from "../services/iplBillingService.js";
import { getAccountById } from "../models/login.js";
import { getBillsByPeriodId } from "../models/billModel.js";
import { responseSucces } from "../utils/response.js";
import { emitSyncEvent } from "../utils/socket.js";

// ==========================================
// 🏢 CONTROLLER KHUSUS BENDAHARA & RT (/admin)
// ==========================================

/**
 * Buat Periode Tagihan Baru (Draft)
 * Khusus: Bendahara
 */
export async function createBillPeriodController(req, res) {
    const { title, defaultAmount, default_amount, nominal, dueDate, due_date, periodMonth, period_month, month, periodYear, period_year, year } = req.body;
    const actorId = req.user.id;

    const targetAmount = defaultAmount || default_amount || nominal;
    const targetDueDate = dueDate || due_date;
    const targetMonth = periodMonth || period_month || month;
    const targetYear = periodYear || period_year || year;

    try {
        const result = await createBillPeriodService({
            title,
            defaultAmount: targetAmount,
            dueDate: targetDueDate,
            periodMonth: targetMonth,
            periodYear: targetYear,
            createdBy: actorId
        });

        if (result.error) {
            return res.status(400).json({ pesan: result.error });
        }

        emitSyncEvent("finance");
        return responseSucces(201, result.period, result.message, res);
    } catch (err) {
        console.error("[Controller Error createBillPeriod]:", err);
        return res.status(500).json({ pesan: "Terjadi kesalahan pada server: " + err.message });
    }
}

/**
 * Ambil Daftar Seluruh Periode Tagihan
 * Akses: Bendahara, RT, Sekretaris
 */
export async function getAllBillPeriodsController(req, res) {
    const { status, year, month, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    try {
        const periods = await getAllBillPeriodsService({
            status,
            periodYear: year,
            periodMonth: month,
            limit: parseInt(limit),
            offset
        });

        if (periods.error) {
            return res.status(400).json({ pesan: periods.error });
        }

        return responseSucces(200, periods, "Daftar periode tagihan berhasil diambil", res);
    } catch (err) {
        console.error("[Controller Error getAllBillPeriods]:", err);
        return res.status(500).json({ pesan: "Terjadi kesalahan pada server: " + err.message });
    }
}

/**
 * Ambil Detail Periode Tagihan & Rekap Ringkas
 * Akses: Bendahara, RT, Sekretaris
 */
export async function getBillPeriodDetailController(req, res) {
    const { id } = req.params;
    try {
        const result = await getBillPeriodDetailService(id);
        if (result.error) {
            return res.status(404).json({ pesan: result.error });
        }

        return responseSucces(200, result, "Detail periode tagihan berhasil diambil", res);
    } catch (err) {
        console.error("[Controller Error getBillPeriodDetail]:", err);
        return res.status(500).json({ pesan: "Terjadi kesalahan pada server: " + err.message });
    }
}

/**
 * Publish Periode Tagihan — Generate Tagihan Warga
 * Khusus: Bendahara
 */
export async function publishBillPeriodController(req, res) {
    const { id } = req.params;
    const actorId = req.user.id;

    try {
        const result = await publishBillPeriodService(id, actorId);
        if (result.error) {
            return res.status(400).json({ pesan: result.error });
        }

        emitSyncEvent("finance");
        return responseSucces(200, result, result.message, res);
    } catch (err) {
        console.error("[Controller Error publishBillPeriod]:", err);
        return res.status(500).json({ pesan: "Terjadi kesalahan pada server: " + err.message });
    }
}

/**
 * Ambil Rekapitulasi Keuangan per Periode
 * Akses: Bendahara, RT, Sekretaris
 */
export async function getPeriodSummaryController(req, res) {
    const { id } = req.params;
    try {
        const result = await getPeriodSummaryService(id);
        if (result.error) {
            return res.status(404).json({ pesan: result.error });
        }

        return responseSucces(200, result, "Rekapitulasi tagihan periode berhasil diambil", res);
    } catch (err) {
        console.error("[Controller Error getPeriodSummary]:", err);
        return res.status(500).json({ pesan: "Terjadi kesalahan pada server: " + err.message });
    }
}

/**
 * Ambil Daftar Seluruh Tagihan dalam Suatu Periode
 * Akses: Bendahara, RT, Sekretaris
 */
export async function getPeriodBillsController(req, res) {
    const { id } = req.params;
    const { status, page = 1, limit = 100 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    try {
        const bills = await getBillsByPeriodId(id, {
            status,
            limit: parseInt(limit),
            offset
        });

        return responseSucces(200, bills, "Daftar tagihan warga pada periode ini berhasil diambil", res);
    } catch (err) {
        console.error("[Controller Error getPeriodBills]:", err);
        return res.status(500).json({ pesan: "Terjadi kesalahan pada server: " + err.message });
    }
}

/**
 * Set Tagihan Menjadi Bebas (Exempt)
 * Akses: RT, Bendahara
 */
export async function setExemptController(req, res) {
    const { id } = req.params;
    const { reason, exempt_reason, alasan } = req.body;
    const targetReason = reason || exempt_reason || alasan;
    const actorId = req.user.id;

    try {
        const result = await setExemptService(id, targetReason, actorId);
        if (result.error) {
            return res.status(400).json({ pesan: result.error });
        }

        emitSyncEvent("finance");
        return responseSucces(200, result.bill, result.message, res);
    } catch (err) {
        console.error("[Controller Error setExempt]:", err);
        return res.status(500).json({ pesan: "Terjadi kesalahan pada server: " + err.message });
    }
}

/**
 * Ambil Daftar Pembayaran Pending yang Membutuhkan Verifikasi
 * Akses: Bendahara, RT
 */
export async function getPendingPaymentsController(req, res) {
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    try {
        const list = await getPendingPaymentsService({
            limit: parseInt(limit),
            offset
        });

        if (list.error) {
            return res.status(400).json({ pesan: list.error });
        }

        return responseSucces(200, list, "Daftar pembayaran menunggu verifikasi berhasil diambil", res);
    } catch (err) {
        console.error("[Controller Error getPendingPayments]:", err);
        return res.status(500).json({ pesan: "Terjadi kesalahan pada server: " + err.message });
    }
}

/**
 * Verifikasi Bukti Pembayaran (Approve / Reject)
 * Khusus: Bendahara
 */
export async function verifyPaymentController(req, res) {
    const { id } = req.params;
    const { decision, status, rejectReason, reject_reason, alasan } = req.body;
    const actorId = req.user.id;

    // Normalisasi parameter status / decision
    let targetDecision = decision || status;
    if (targetDecision === 'diterima') targetDecision = 'approved';
    if (targetDecision === 'ditolak') targetDecision = 'rejected';

    const targetRejectReason = rejectReason || reject_reason || alasan;

    try {
        const result = await verifyPaymentService({
            paymentId: id,
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
        console.error("[Controller Error verifyPayment]:", err);
        return res.status(500).json({ pesan: "Terjadi kesalahan pada server: " + err.message });
    }
}

/**
 * Audit Trail Pembayaran (Read-Only Histori Verifikasi)
 * Akses: RT, Superadmin, Admin, Bendahara
 */
export async function getPaymentAuditController(req, res) {
    const { status, channel, billPeriodId, page = 1, limit = 100 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    try {
        const list = await getPaymentAuditService({
            status,
            channel,
            billPeriodId,
            limit: parseInt(limit),
            offset
        });

        if (list.error) {
            return res.status(400).json({ pesan: list.error });
        }

        return responseSucces(200, list, "Audit trail pembayaran berhasil ditarik", res);
    } catch (err) {
        console.error("[Controller Error getPaymentAudit]:", err);
        return res.status(500).json({ pesan: "Terjadi kesalahan pada server: " + err.message });
    }
}


// ==========================================
// 👥 CONTROLLER KHUSUS WARGA (/resident)
// ==========================================

/**
 * Ambil Daftar Tagihan Milik Keluarga Warga Sendiri
 * Akses: Warga
 */
export async function getMyBillsController(req, res) {
    const userId = req.user.id;
    const { status, year, month } = req.query;

    try {
        const bills = await getMyBillsService(userId, { status, year, month });
        if (bills.error) {
            return res.status(400).json({ pesan: bills.error });
        }

        return responseSucces(200, bills, "Daftar tagihan IPL keluarga berhasil diambil", res);
    } catch (err) {
        console.error("[Controller Error getMyBills]:", err);
        return res.status(500).json({ pesan: "Terjadi kesalahan pada server: " + err.message });
    }
}

/**
 * Ambil Detail Tagihan Spesifik & Riwayat Pembayaran
 * Akses: Warga (Family-Gate) atau Pengurus
 */
export async function getBillDetailController(req, res) {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    try {
        const result = await getBillDetailWithAuthService(id, userId, userRole);
        if (result.unauthorized) {
            return res.status(403).json({ pesan: result.error });
        }
        if (result.error) {
            return res.status(404).json({ pesan: result.error });
        }

        return responseSucces(200, result, "Detail tagihan berhasil diambil", res);
    } catch (err) {
        console.error("[Controller Error getBillDetail]:", err);
        return res.status(500).json({ pesan: "Terjadi kesalahan pada server: " + err.message });
    }
}

/**
 * Warga Mengirim Bukti Pembayaran IPL (atau Staf Input Cash)
 * Akses: Warga, RT, Bendahara
 */
export async function submitPaymentController(req, res) {
    const userId = req.user.id;
    const userRole = req.user.role;
    const { billId, bill_id, amount, amountStated, amount_stated, channel } = req.body;

    const targetBillId = billId || bill_id;
    const targetAmount = amountStated || amount_stated || amount;
    const targetChannel = channel || (req.file ? "transfer" : "transfer");

    if (!targetBillId) {
        return res.status(400).json({ pesan: "ID Tagihan (billId) wajib disertakan masbro!" });
    }

    // Jika channel transfer tapi tidak ada file yang diunggah
    if (targetChannel === "transfer" && !req.file) {
        return res.status(400).json({ pesan: "Berkas bukti transfer (file) wajib diunggah masbro!" });
    }

    // Role check: hanya bendahara yang boleh submit langsung 'cash_to_bendahara'
    if (targetChannel === "cash_to_bendahara" && userRole !== "bendahara" && userRole !== "admin" && userRole !== "superadmin") {
        return res.status(403).json({ pesan: "Akses ditolak, hanya Bendahara yang dapat mencatat pembayaran tunai langsung di tempat!" });
    }

    // Jika user adalah warga, pastikan tagihan adalah milik keluarganya (Family-Gate)
    if (userRole === "warga") {
        const userData = await getAccountById(userId);
        const familyId = userData && userData[0] ? userData[0].family_id : null;
        if (!familyId) {
            return res.status(400).json({ pesan: "Akun Anda belum terikat dengan Kartu Keluarga!" });
        }

        const billCheck = await getBillDetailWithAuthService(targetBillId, userId, userRole);
        if (billCheck.unauthorized) {
            return res.status(403).json({ pesan: billCheck.error });
        }
        if (billCheck.error) {
            return res.status(404).json({ pesan: billCheck.error });
        }
    }

    const proofUrl = req.file ? req.file.filename : null;

    try {
        const result = await submitPaymentService({
            billId: targetBillId,
            amountStated: targetAmount,
            channel: targetChannel,
            proofUrl,
            recordedBy: userId
        });

        if (result.error) {
            return res.status(400).json({ pesan: result.error });
        }

        emitSyncEvent("finance");
        return responseSucces(201, result, result.message, res);
    } catch (err) {
        console.error("[Controller Error submitPayment]:", err);
        return res.status(500).json({ pesan: "Terjadi kesalahan pada server: " + err.message });
    }
}
