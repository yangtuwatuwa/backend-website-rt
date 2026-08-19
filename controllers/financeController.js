import { 
    recordExpenseService, 
    recordIncomeService,
    recordManualPaymentService,
    getDashboardStatsService, 
    getTrackingService,
    getFinancialSummaryService
} from "../services/financialService.js";
import { 
    getFinancialSettings, 
    updateFinancialSettings, 
    getLedgerList
} from "../models/financial.js";
import { getBillsByFamilyId } from "../models/billModel.js";
import { getPendingPaymentsList } from "../models/paymentModel.js";
import { getPendingKasContributions, getKasContributionsByFamily } from "../models/kasModel.js";
import { getAccountById } from "../models/login.js";
import { responseSucces } from "../utils/response.js";
import { emitSyncEvent } from "../utils/socket.js";

// =========================================================================
// 👥 CONTROLLER KHUSUS WARGA (/resident)
// =========================================================================

/**
 * Histori Pembayaran Keluarga (IPL Bills & Kas Contributions)
 * Route: GET /resident/my-payments
 */
export async function getFamilyPaymentsController(req, res) {
    const userId = req.user.id;
    try {
        const dataUser = await getAccountById(userId);
        if (!dataUser || dataUser.length === 0) {
            return res.status(404).json({ pesan: "Akun warga tidak ditemukan" });
        }

        const familyId = dataUser[0].family_id;
        if (!familyId) {
            return res.status(400).json({ pesan: "Akun anda belum terikat dengan KK mana pun" });
        }

        const iplBills = await getBillsByFamilyId(familyId);
        const kasHistory = await getKasContributionsByFamily(familyId);

        return responseSucces(200, { ipl: iplBills, kas: kasHistory }, "Histori pembayaran keluarga berhasil diambil", res);
    } catch (err) {
        console.error("[Error Get Family Payments]:", err);
        return res.status(500).json({ pesan: "Error di controller getFamilyPaymentsController: " + err.message });
    }
}

// =========================================================================
// 🪙 CONTROLLER KHUSUS BENDAHARA & RT (/admin)
// =========================================================================

/**
 * Daftar Seluruh Pembayaran Pending (IPL + Kas)
 * Route: GET /admin/finance/pending
 */
export async function getPendingPaymentsController(req, res) {
    try {
        const pendingIpl = await getPendingPaymentsList({ limit: 100 });
        const pendingKas = await getPendingKasContributions({ limit: 100 });

        return responseSucces(200, { ipl: pendingIpl, kas: pendingKas }, "Daftar pending pembayaran berhasil diambil", res);
    } catch (err) {
        console.error("[Error Get Pending Payments]:", err);
        return res.status(500).json({ pesan: "Error di controller getPendingPaymentsController: " + err.message });
    }
}

/**
 * Mencatat Pengeluaran Kas RT (Ledger Entry Tipe 'out')
 * Route: POST /admin/finance/expense
 */
export async function recordExpenseController(req, res) {
    const { amount, sourceType, pos_pengeluaran, category, description, keterangan } = req.body;
    const targetAmount = amount;
    const targetType = sourceType || pos_pengeluaran || category || "lainnya";
    const targetDesc = description || keterangan || "-";
    const receiptFile = req.file ? req.file.filename : null;

    if (!targetAmount || isNaN(targetAmount) || Number(targetAmount) <= 0) {
        return res.status(400).json({ pesan: "Nominal pengeluaran (amount) wajib diisi angka positif masbro!" });
    }

    try {
        const result = await recordExpenseService(parseFloat(targetAmount), targetType, targetDesc, receiptFile);
        if (typeof result === "string" && result.startsWith("error")) {
            return res.status(400).json({ pesan: result });
        }

        emitSyncEvent("finance");
        return responseSucces(200, result, "Pengeluaran kas RT berhasil dicatat cuy!", res);
    } catch (err) {
        console.error("[Error Record Expense]:", err);
        return res.status(500).json({ pesan: "Error di controller recordExpenseController: " + err.message });
    }
}

/**
 * Rekapitulasi Arus Kas Bulanan
 * Route: GET /admin/finance/summary
 */
export async function getFinancialSummaryController(req, res) {
    const year = req.query.year || new Date().getFullYear();
    try {
        const summary = await getFinancialSummaryService(year);
        if (typeof summary === "string" && summary.startsWith("error")) {
            return res.status(400).json({ pesan: summary });
        }
        return responseSucces(200, summary, "Rekapitulasi arus kas bulanan berhasil diambil masbro", res);
    } catch (err) {
        console.error("[Error Get Financial Summary]:", err);
        return res.status(500).json({ pesan: "Error di controller getFinancialSummaryController: " + err.message });
    }
}

/**
 * Mencatat Pemasukan Kas RT Non-Iuran (Donasi, Hibah, Subsidi)
 * Route: POST /admin/finance/income
 */
export async function recordIncomeController(req, res) {
    const { amount, sourceType, description } = req.body;

    if (!amount || isNaN(amount) || Number(amount) <= 0) {
        return res.status(400).json({ pesan: "Nominal pemasukan (amount) wajib diisi angka positif masbro!" });
    }

    try {
        const result = await recordIncomeService(parseFloat(amount), sourceType, description);
        if (typeof result === "string" && result.startsWith("error")) {
            return res.status(400).json({ pesan: result });
        }

        emitSyncEvent("finance");
        return responseSucces(200, result, "Pemasukan kas RT (luar iuran) berhasil dicatat cuy!", res);
    } catch (err) {
        console.error("[Error Record Income]:", err);
        return res.status(500).json({ pesan: "Error di controller recordIncomeController: " + err.message });
    }
}

/**
 * Mengubah Pengaturan Nominal Default IPL & Saldo Awal
 * CATATAN PENTING: iplNominal di sini HANYA nilai default saat Bendahara membuat draft bill_period baru.
 * Nominal ini TIDAK mengubah tagihan aktif warga yang sudah diterbitkan.
 * Route: PATCH /admin/finance/settings
 */
export async function updateFinancialSettingsController(req, res) {
    const { iplNominal, previousBalance, ipl_amount, ipl_nominal, previous_balance, saldo_awal } = req.body;

    try {
        const currentSettings = await getFinancialSettings();

        const rawIpl = iplNominal ?? ipl_nominal ?? ipl_amount;
        const parsedIpl = rawIpl !== undefined ? parseFloat(rawIpl) : NaN;
        const finalIpl = !isNaN(parsedIpl) ? parsedIpl : (currentSettings ? currentSettings.ipl_nominal : 200000);

        const rawPrevBalance = previousBalance ?? previous_balance ?? saldo_awal;
        const parsedPrevBalance = rawPrevBalance !== undefined ? parseFloat(rawPrevBalance) : NaN;
        const finalPrevBalance = !isNaN(parsedPrevBalance) ? parsedPrevBalance : (currentSettings ? currentSettings.previous_balance : 0);

        const result = await updateFinancialSettings(finalIpl, finalPrevBalance);

        return responseSucces(200, result, "Pengaturan keuangan RT berhasil diperbarui masbro", res);
    } catch (err) {
        console.error("[Error Update Financial Settings]:", err);
        return res.status(500).json({ pesan: "Error di controller updateFinancialSettingsController: " + err.message });
    }
}

/**
 * Mengambil Pengaturan Nominal Default IPL & Saldo Awal
 * Route: GET /admin/finance/settings
 */
export async function getFinancialSettingsController(req, res) {
    try {
        const settings = await getFinancialSettings();
        return res.json(settings);
    } catch (err) {
        console.error("[Error Get Financial Settings]:", err);
        return res.status(500).json({ pesan: "Error di controller getFinancialSettingsController: " + err.message });
    }
}

/**
 * Dashboard Pelacakan Tunggakan IPL Warga (Tracking)
 * Query langsung bersumber dari tabel 'bills' join 'bill_periods'
 * Route: GET /admin/finance/tracking
 */
export async function getArrearsTrackingController(req, res) {
    const now = new Date();
    const month = req.query.month ? parseInt(req.query.month) : now.getMonth() + 1;
    const year = req.query.year ? parseInt(req.query.year) : now.getFullYear();

    try {
        const list = await getTrackingService(month, year);
        if (typeof list === "string" && list.startsWith("error")) {
            return res.status(400).json({ pesan: list });
        }

        const settings = await getFinancialSettings();
        const defaultNominal = settings ? Number(settings.ipl_nominal) : 200000;

        const mappedList = list.map(item => {
            let statusLabel = "Nunggak";
            let ketepatanWaktu = "-";

            if (item.bill_status === "paid" || item.payment_status === "approved") {
                statusLabel = "Lunas";
                if (item.payment_date && item.due_date) {
                    const payDate = new Date(item.payment_date);
                    const dueDate = new Date(item.due_date);
                    ketepatanWaktu = payDate <= dueDate ? "Tepat Waktu" : "Terlambat";
                } else {
                    ketepatanWaktu = "Tepat Waktu";
                }
            } else if (item.bill_status === "waiting_verification" || item.payment_status === "pending") {
                statusLabel = "Pending Verifikasi";
            } else if (item.bill_status === "exempt") {
                statusLabel = "Bebas Iuran";
            } else if (item.bill_status === "unpaid") {
                if (item.due_date && new Date(item.due_date) < now) {
                    statusLabel = "Nunggak";
                } else {
                    statusLabel = "Belum Bayar";
                }
            } else {
                // Belum ada periode tagihan diterbitkan
                statusLabel = "Nunggak";
            }

            return {
                family_id: item.family_id,
                no_kk: item.no_kk,
                kepala_keluarga_nama: item.kepala_keluarga_nama || "Tanpa Nama",
                bill_id: item.bill_id || null,
                target_bulan: `${month}/${year}`,
                nominal_tagihan: item.bill_amount ? Number(item.bill_amount) : defaultNominal,
                status: statusLabel,
                ketepatan_waktu: ketepatanWaktu
            };
        });

        return responseSucces(200, mappedList, "Daftar status iuran IPL warga berhasil ditarik masbro", res);
    } catch (err) {
        console.error("[Error Get Arrears Tracking]:", err);
        return res.status(500).json({ pesan: "Error di controller getArrearsTrackingController: " + err.message });
    }
}

/**
 * Mencatat Pembayaran Iuran Manual (Cash / Transfer Langsung ke RT/Bendahara)
 * - Jika jenis_iuran = 'ipl': mewajibkan billIds (support rapel manual), langsung approved & paid di tabel bills/payments
 * - Jika jenis_iuran = 'kas': mengarahkan ke tabel kas_contributions
 * Keduanya otomatis mencatat ke financial_ledger.
 * Route: POST /admin/finance/manual-payment
 */
export async function recordManualPaymentController(req, res) {
    const { 
        family_id, familyId, 
        jenis_iuran, jenisIuran, 
        amount, 
        billIds, bill_ids, billId, bill_id,
        month, year, 
        category, description, 
        payment_date, paymentDate 
    } = req.body;

    const targetFamilyId = family_id || familyId;
    const targetJenisIuran = (jenis_iuran || jenisIuran || "ipl").toLowerCase();
    const targetAmount = amount;
    const targetMonth = month;
    const targetYear = year;
    const targetDate = payment_date || paymentDate;
    const actorId = req.user.id;

    let parsedBillIds = [];
    const rawBillIds = billIds || bill_ids || billId || bill_id;
    if (Array.isArray(rawBillIds)) {
        parsedBillIds = rawBillIds.map(Number).filter(n => !isNaN(n) && n > 0);
    } else if (typeof rawBillIds === "string") {
        try {
            const parsed = JSON.parse(rawBillIds);
            if (Array.isArray(parsed)) parsedBillIds = parsed.map(Number).filter(n => !isNaN(n) && n > 0);
            else if (!isNaN(Number(parsed))) parsedBillIds = [Number(parsed)];
        } catch (e) {
            if (rawBillIds.includes(",")) parsedBillIds = rawBillIds.split(",").map(s => Number(s.trim())).filter(n => !isNaN(n) && n > 0);
            else if (!isNaN(Number(rawBillIds))) parsedBillIds = [Number(rawBillIds)];
        }
    } else if (typeof rawBillIds === "number" && rawBillIds > 0) {
        parsedBillIds = [rawBillIds];
    }

    if (!targetFamilyId) {
        return res.status(400).json({ pesan: "Pilih Warga / KK Pembayar dulu masbro!" });
    }
    if (!targetAmount || isNaN(targetAmount) || Number(targetAmount) <= 0) {
        return res.status(400).json({ pesan: "Nominal pembayaran wajib diisi angka positif masbro!" });
    }

    try {
        const result = await recordManualPaymentService({
            familyId: targetFamilyId,
            jenisIuran: targetJenisIuran,
            amount: Number(targetAmount),
            billIds: parsedBillIds,
            month: targetMonth,
            year: targetYear,
            category,
            description,
            paymentDate: targetDate,
            recordedBy: actorId
        });

        if (typeof result === "string" && result.startsWith("error")) {
            return res.status(400).json({ pesan: result });
        }

        emitSyncEvent("finance");
        return responseSucces(201, result, "Pencatatan iuran warga manual berhasil disimpan masbro!", res);
    } catch (err) {
        console.error("[Error Record Manual Payment]:", err);
        return res.status(500).json({ pesan: "Error di controller recordManualPaymentController: " + err.message });
    }
}

// =========================================================================
// 🌐 CONTROLLER PUBLIK (/post & /admin)
// =========================================================================

/**
 * Statistik Dashboard Finansial & Kas RT
 * Route: GET /post/dashboard-stats
 */
export async function getDashboardStatsController(req, res) {
    try {
        const stats = await getDashboardStatsService();
        if (typeof stats === "string" && stats.startsWith("error")) {
            return res.status(400).json({ pesan: stats });
        }

        const ledgerHistory = await getLedgerList();
        return responseSucces(200, { stats, ledger: ledgerHistory }, "Statistik dashboard kas RT berhasil diambil masbro", res);
    } catch (err) {
        console.error("[Error Get Dashboard Stats]:", err);
        return res.status(500).json({ pesan: "Error di controller getDashboardStatsController: " + err.message });
    }
}
