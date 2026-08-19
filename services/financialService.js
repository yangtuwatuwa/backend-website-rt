import { 
    getFinancialSettings, 
    updateFinancialSettings, 
    writeLedgerEntry,
    insertLedger, 
    getLedgerStats, 
    getLedgerList, 
    getArrearsTracking,
    getMonthlyFinancialSummary
} from "../models/financial.js";
import { getWargas } from "../models/inputwarganya.js";
import { submitPaymentService } from "./iplBillingService.js";
import { submitKasContributionService } from "./kasService.js";
import pool from "../config/sqlconfig.js";

/**
 * Pencatatan Pengeluaran Kas RT (Expense)
 */
export async function recordExpenseService(amount, sourceType, description, receiptFile = null) {
    const allowedExpenses = ["kebersihan", "keamanan", "taman", "operasional_rt", "kematian", "sosial", "kegiatan", "lainnya"];
    const cleanType = String(sourceType || "lainnya").toLowerCase().trim();
    const targetType = allowedExpenses.includes(cleanType) ? cleanType : "lainnya";

    try {
        const result = await writeLedgerEntry({
            type: "out",
            amount,
            sourceType: targetType,
            description,
            receiptFile
        });
        return result;
    } catch (err) {
        console.error("error recordExpenseService:", err);
        return "error recordExpenseService: " + err.message;
    }
}

/**
 * Pencatatan Pemasukan Kas RT Non-Iuran (Donasi, Hibah, Subsidi, dll)
 */
export async function recordIncomeService(amount, sourceType, description) {
    const cleanType = String(sourceType).toLowerCase().trim();
    
    // Map kategori input ke nilai ENUM yang didukung database
    let dbSourceType = "lainnya";
    if (cleanType === "donasi" || cleanType === "donasi_sukarela" || cleanType === "donasi / sukarela" || cleanType === "hibah") {
        dbSourceType = "sosial";
    } else if (cleanType === "sponsorship" || cleanType === "kegiatan") {
        dbSourceType = "kegiatan";
    } else if (cleanType === "subsidi" || cleanType === "lainnya") {
        dbSourceType = "lainnya";
    } else {
        dbSourceType = "lainnya";
    }

    const categoryLabel = cleanType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const finalDescription = `[${categoryLabel}] ${description}`;

    try {
        const result = await writeLedgerEntry({
            type: "in",
            amount,
            sourceType: dbSourceType,
            description: finalDescription
        });
        return result;
    } catch (err) {
        console.error("error recordIncomeService:", err);
        return "error recordIncomeService: " + err.message;
    }
}

/**
 * Ringkasan Arus Kas Bulanan
 */
export async function getFinancialSummaryService(year = new Date().getFullYear()) {
    try {
        const summary = await getMonthlyFinancialSummary(year);
        const stats = await getLedgerStats();
        const settings = await getFinancialSettings();
        return {
            year: parseInt(year),
            previous_balance: settings ? settings.previous_balance : 0,
            total_income: stats ? parseInt(stats.total_income) || 0 : 0,
            total_expense: stats ? parseInt(stats.total_expense) || 0 : 0,
            monthly_breakdown: summary
        };
    } catch (err) {
        console.error("error getFinancialSummaryService:", err);
        return "error getFinancialSummaryService: " + err.message;
    }
}

/**
 * Statistik Dashboard Finansial & Kas RT
 */
export async function getDashboardStatsService() {
    try {
        const wargas = await getWargas();
        const totalWarga = Array.isArray(wargas) ? wargas.length : 0;

        const settings = await getFinancialSettings();
        const previousBalance = settings ? settings.previous_balance : 0;

        const ledgerStats = await getLedgerStats();
        const income = ledgerStats ? parseInt(ledgerStats.total_income) || 0 : 0;
        const expense = ledgerStats ? parseInt(ledgerStats.total_expense) || 0 : 0;

        const currentBalance = previousBalance + income - expense;

        return {
            total_warga: totalWarga,
            previous_balance: previousBalance,
            total_income: income,
            total_expense: expense,
            current_balance: currentBalance
        };
    } catch (err) {
        console.error("error getDashboardStatsService:", err);
        return "error getDashboardStatsService: " + err.message;
    }
}

/**
 * Pelacakan Tunggakan IPL Warga
 */
export async function getTrackingService(month, year) {
    try {
        const result = await getArrearsTracking(month, year);
        return result;
    } catch (err) {
        console.error("error getTrackingService:", err);
        return "error getTrackingService: " + err.message;
    }
}

/**
 * Pencatatan Pembayaran Iuran Manual (Cash / Transfer langsung ke RT/Bendahara)
 * - Jika jenis_iuran = "ipl": Menghubungkan ke tagihan aktif 'bills' & 'payments' (Mendukung Rapel via billIds)
 * - Jika jenis_iuran = "kas": Mengarahkan ke modul 'kas_contributions'
 * Keduanya otomatis berstatus 'approved', update status 'bills', dan mencatat ke 'financial_ledger'.
 */
export async function recordManualPaymentService({
    familyId,
    jenisIuran = "ipl",
    amount,
    billIds = [],
    month,
    year,
    category = "sosial",
    description,
    paymentDate,
    recordedBy = null
}) {
    try {
        const isIpl = (jenisIuran === "ipl" || jenisIuran === "kebersihan" || jenisIuran === "iuran_ipl");
        
        // Cari resident dari KK
        const [wargaRows] = await pool.execute(
            "SELECT id FROM warga WHERE family_id = ? ORDER BY id ASC LIMIT 1",
            [familyId]
        );
        const residentId = wargaRows.length > 0 ? wargaRows[0].id : null;

        if (isIpl) {
            let targetBillIds = Array.isArray(billIds) ? billIds.filter(id => Boolean(id)) : [];

            // Jika billIds tidak disertakan, cari bill aktif berdasarkan month & year
            if (targetBillIds.length === 0 && (month || year) && residentId) {
                const targetMonth = Number(month || new Date().getMonth() + 1);
                const targetYear = Number(year || new Date().getFullYear());

                const [foundBills] = await pool.execute(`
                    SELECT b.id, b.amount 
                    FROM bills b
                    JOIN bill_periods bp ON b.bill_period_id = bp.id
                    WHERE (b.resident_id = ? OR b.resident_id IN (SELECT w.id FROM warga w WHERE w.family_id = ?))
                      AND bp.period_month = ? AND bp.period_year = ?
                    LIMIT 1
                `, [residentId, familyId, targetMonth, targetYear]);

                if (foundBills.length > 0) {
                    targetBillIds = [foundBills[0].id];
                }
            }

            if (targetBillIds.length === 0) {
                return "error: Wajib menyertakan billIds tagihan yang ingin dibayar manual masbro!";
            }

            const paymentResult = await submitPaymentService({
                billIds: targetBillIds,
                residentId: residentId || 1,
                amountStated: amount,
                channel: "cash_to_bendahara",
                proofUrl: "manual_cash_recorded",
                recordedBy
            });

            if (paymentResult.error) {
                return "error: " + paymentResult.error;
            }

            return {
                message: "Pencatatan iuran IPL manual berhasil diselesaikan",
                payment_id: paymentResult.payment_id,
                bill_ids: paymentResult.bill_ids
            };
        } else {
            // Jalur Iuran Kas
            if (!residentId) {
                return "error: Data warga dalam Kartu Keluarga tersebut tidak ditemukan!";
            }

            const kasResult = await submitKasContributionService({
                residentId,
                amount,
                category: category || "sosial",
                description: description || `Pencatatan Kas RT Manual KK ID ${familyId}`,
                channel: "cash_to_bendahara",
                proofUrl: "manual_cash_recorded",
                recordedBy
            });

            if (kasResult.error) {
                return "error: " + kasResult.error;
            }

            return {
                message: "Pencatatan iuran Kas RT manual berhasil diselesaikan",
                contribution_id: kasResult.contribution_id
            };
        }
    } catch (err) {
        console.error("error recordManualPaymentService:", err);
        return "error recordManualPaymentService: " + err.message;
    }
}
