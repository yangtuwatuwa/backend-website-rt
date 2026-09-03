import pool from "../config/sqlconfig.js";
import {
    createBillPeriod,
    getBillPeriodById,
    getBillPeriodByMonthYear,
    getAllBillPeriods,
    updateBillPeriodStatus
} from "../models/billPeriodModel.js";
import {
    createBatchBills,
    getBillById,
    getBillsByIdsForUpdate,
    getBillsByFamilyId,
    getBillsByPeriodId,
    updateBillStatus,
    updateMultipleBillStatus,
    setBillExempt,
    getBillsSummaryByPeriodId,
    computeBillStatus
} from "../models/billModel.js";
import {
    createPaymentWithLinks,
    getPaymentById,
    getPaymentByIdForUpdate,
    getPaymentLinksByPaymentId,
    getPaymentsByBillId,
    getPendingPaymentsList,
    getPaymentAuditList,
    updatePaymentVerification,
    isBillInPendingPayment,
    hasApprovedPayment
} from "../models/paymentModel.js";
import { writeLedgerEntry } from "../models/financial.js";
import { getAccountById } from "../models/login.js";
import { createNotification, createBroadcastFamilyNotifications } from "./notificationService.js";

let publishBillPeriodSavepointCounter = 0;
let submitPaymentSavepointCounter = 0;
let verifyPaymentSavepointCounter = 0;
let recordCashPaymentSavepointCounter = 0;

function normalizePositiveInteger(value) {
    const normalized = Number(value);
    return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
}

function normalizeCashBillIds(billIds) {
    if (!Array.isArray(billIds)) return [];

    const normalized = billIds.map(normalizePositiveInteger);
    if (normalized.some(id => id === null)) return [];
    return [...new Set(normalized)];
}

async function writeCashPaymentAudit(connection, {
    actorId,
    actorRole,
    actorUsername,
    ipAddress,
    userAgent,
    familyId,
    billIds,
    paymentId,
    totalAmount
}) {
    const details = JSON.stringify({
        actor_id: actorId,
        actor_role: actorRole || null,
        family_id: familyId,
        bill_ids: billIds,
        payment_id: paymentId,
        total_amount: totalAmount,
        payment_method: "cash_to_bendahara",
        timestamp: new Date().toISOString()
    });

    await connection.execute(
        `INSERT INTO access_logs
            (username, event_type, ip_address, user_agent, status, details)
         VALUES (?, 'IPL_CASH_PAYMENT_RECORDED', ?, ?, 'success', ?)`,
        [
            actorUsername || `account:${actorId || "unknown"}`,
            ipAddress || "-",
            userAgent || "-",
            details
        ]
    );
}

async function getResettableBillIdsForUpdate(billIds, connection) {
    const currentBills = await getBillsByIdsForUpdate(billIds, connection);
    return currentBills
        .filter(bill => bill.status !== 'exempt')
        .map(bill => bill.id);
}

/**
 * 1. Membuat Periode Tagihan Baru (Draft)
 */
export async function createBillPeriodService({ title, defaultAmount, dueDate, periodMonth, periodYear, createdBy }, executor = pool) {
    try {
        const month = parseInt(periodMonth);
        const year = parseInt(periodYear);
        const amount = parseFloat(defaultAmount);

        if (!title || !title.trim()) {
            return { error: "Judul periode tagihan (title) wajib diisi masbro!" };
        }
        if (isNaN(amount) || amount <= 0) {
            return { error: "Nominal default tagihan (defaultAmount) harus berupa angka positif!" };
        }
        if (!dueDate) {
            return { error: "Tenggat waktu jatuh tempo (dueDate) wajib diisi!" };
        }
        if (isNaN(month) || month < 1 || month > 12) {
            return { error: "Bulan periode (periodMonth) harus antara 1 sampai 12!" };
        }
        if (isNaN(year) || year < 2000) {
            return { error: "Tahun periode (periodYear) tidak valid!" };
        }

        // Cek apakah sudah ada periode untuk bulan dan tahun yang sama
        const existing = await getBillPeriodByMonthYear(month, year, executor);
        if (existing) {
            return { error: `Periode tagihan untuk bulan ${month}/${year} sudah ada dengan judul "${existing.title}"!` };
        }

        const result = await createBillPeriod({
            title: title.trim(),
            defaultAmount: amount,
            dueDate,
            periodMonth: month,
            periodYear: year,
            createdBy
        }, executor);

        const createdPeriod = await getBillPeriodById(result.insertId, executor);
        return {
            message: "Periode tagihan berhasil dibuat (Status: Draft)",
            period: createdPeriod
        };
    } catch (err) {
        console.error("error createBillPeriodService:", err);
        return { error: "Gagal membuat periode tagihan: " + err.message };
    }
}

/**
 * 2. Mengambil Daftar & Detail Periode Tagihan
 */
export async function getAllBillPeriodsService(filters, executor = pool) {
    try {
        const periods = await getAllBillPeriods(filters, executor);
        return periods;
    } catch (err) {
        console.error("error getAllBillPeriodsService:", err);
        return { error: "Gagal mengambil daftar periode tagihan: " + err.message };
    }
}

export async function getBillPeriodDetailService(id, executor = pool) {
    try {
        const period = await getBillPeriodById(id, executor);
        if (!period) {
            return { error: "Periode tagihan tidak ditemukan!" };
        }
        const summary = await getBillsSummaryByPeriodId(id, executor);
        return {
            period,
            summary
        };
    } catch (err) {
        console.error("error getBillPeriodDetailService:", err);
        return { error: "Gagal mengambil detail periode tagihan: " + err.message };
    }
}

/**
 * 3. Publish Periode Tagihan — Generate Snapshot Bills untuk Seluruh KELUARGA (family) Aktif
 * 1 Keluarga (KK) = Tepat 1 Bill per Bill Period
 * Idempotent: Dilindungi UNIQUE(bill_period_id, family_id)
 */
export async function publishBillPeriodService(billPeriodId, actorId, executor = undefined) {
    const ownsTransaction = !executor;
    const connection = executor || await pool.getConnection();
    const savepointName = ownsTransaction
        ? null
        : `sp_publish_bill_period_${++publishBillPeriodSavepointCounter}`;
    let transactionStarted = false;
    let savepointCreated = false;

    try {
        if (ownsTransaction) {
            await connection.beginTransaction();
            transactionStarted = true;
        }

        // 1. Ambil data periode
        const [periodRows] = await connection.execute(
            "SELECT * FROM bill_periods WHERE id = ? FOR UPDATE",
            [billPeriodId]
        );
        if (periodRows.length === 0) {
            if (transactionStarted) {
                await connection.rollback();
                transactionStarted = false;
            }
            return { error: "Periode tagihan tidak ditemukan!" };
        }
        const period = periodRows[0];

        if (period.status === 'published') {
            if (transactionStarted) {
                await connection.rollback();
                transactionStarted = false;
            }
            return { error: "Periode tagihan ini sudah pernah dipublish sebelumnya!" };
        }

        // 2. Ambil seluruh keluarga (KK) aktif (1 KK = 1 tagihan per periode)
        const [activeFamilies] = await connection.execute(`
            SELECT f.id AS family_id
            FROM family f
            ORDER BY f.id ASC
        `);

        if (!activeFamilies || activeFamilies.length === 0) {
            if (transactionStarted) {
                await connection.rollback();
                transactionStarted = false;
            }
            return { error: "Tidak ada keluarga (KK) yang ditemukan untuk diterbitkan tagihan!" };
        }

        // 3. Siapkan data batch bills (snapshot amount & due_date per family)
        const billsToInsert = activeFamilies.map(f => ({
            bill_period_id: period.id,
            family_id: f.family_id,
            amount: period.default_amount,
            due_date: period.due_date,
            status: 'unpaid'
        }));

        if (savepointName) {
            await connection.query(`SAVEPOINT ${savepointName}`);
            savepointCreated = true;
        }

        // 4. Batch insert dengan INSERT IGNORE
        await createBatchBills(billsToInsert, connection);

        // 5. Update status periode menjadi 'published'
        await updateBillPeriodStatus(period.id, 'published', connection);

        if (ownsTransaction) {
            await connection.commit();
            transactionStarted = false;
        }

        // Kirim notifikasi in-app ke seluruh keluarga aktif yang diterbitkan tagihan
        try {
            const familyIds = activeFamilies.map(f => f.family_id);
            await createBroadcastFamilyNotifications({
                familyIds,
                type: "ipl",
                title: `Tagihan IPL Baru: ${period.title}`,
                message: `Tagihan IPL untuk periode "${period.title}" sebesar Rp ${Number(period.default_amount).toLocaleString('id-ID')} telah diterbitkan. Jatuh tempo: ${period.due_date}.`,
                referenceType: "bill_period",
                referenceId: period.id,
                emitRealtime: ownsTransaction
            }, ownsTransaction ? undefined : connection);
        } catch (notifErr) {
            console.error("Non-blocking error notifikasi publish IPL:", notifErr.message);
        }

        const summary = await getBillsSummaryByPeriodId(
            period.id,
            ownsTransaction ? pool : connection
        );

        if (!ownsTransaction && savepointCreated) {
            await connection.query(`RELEASE SAVEPOINT ${savepointName}`);
            savepointCreated = false;
        }

        return {
            message: `Tagihan "${period.title}" berhasil dipublish untuk ${activeFamilies.length} keluarga (KK)!`,
            period_id: period.id,
            total_bills_generated: activeFamilies.length,
            summary
        };
    } catch (err) {
        if (transactionStarted) {
            try {
                await connection.rollback();
            } catch (rollbackErr) {
                console.error("error rollback publishBillPeriodService:", rollbackErr);
            }
            transactionStarted = false;
        } else if (savepointCreated) {
            try {
                await connection.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
            } catch (rollbackErr) {
                console.error("error rollback savepoint publishBillPeriodService:", rollbackErr);
            }

            try {
                await connection.query(`RELEASE SAVEPOINT ${savepointName}`);
            } catch (releaseErr) {
                console.error("error release savepoint publishBillPeriodService:", releaseErr);
            }
        }

        console.error("error publishBillPeriodService:", err);
        return { error: "Gagal mempublish tagihan: " + err.message };
    } finally {
        if (ownsTransaction) {
            connection.release();
        }
    }
}

/**
 * 4. Submit Pembayaran IPL — Mendukung Single & Rapel (Banyak Bulan Sekaligus)
 * - Menerima billIds (array ID tagihan)
 * - Validasi kepemilikan tagihan: seluruh bill harus milik familyId akun yang login
 * - Validasi kesesuaian total: SUM(bill.amount) === amountStated
 * - Validasi tidak ada bill yang sudah 'paid', 'exempt', atau sedang 'pending' di payment lain
 * - Channel 'cash_to_bendahara': Langsung APPROVED, Bills PAID, Tulis ke Buku Kas Ledger
 * - Channel 'transfer' atau 'cash_to_rt': Status PENDING, Bills WAITING_VERIFICATION
 */
export async function submitPaymentService({
    billIds,
    billId, // Fallback jika single id dikirim
    familyId,
    residentId, // Fallback
    amountStated,
    channel,
    proofUrl = null,
    recordedBy = null
}, executor = undefined) {
    let targetBillIds = [];
    if (Array.isArray(billIds)) {
        targetBillIds = billIds.map(id => Number(id)).filter(id => !isNaN(id) && id > 0);
    } else if (typeof billIds === "string") {
        try {
            const parsed = JSON.parse(billIds);
            if (Array.isArray(parsed)) {
                targetBillIds = parsed.map(id => Number(id)).filter(id => !isNaN(id) && id > 0);
            } else if (!isNaN(Number(parsed))) {
                targetBillIds = [Number(parsed)];
            }
        } catch (e) {
            // String biasa
            const num = Number(billIds);
            if (!isNaN(num) && num > 0) targetBillIds = [num];
        }
    } else if (billId && !isNaN(Number(billId))) {
        targetBillIds = [Number(billId)];
    }

    if (targetBillIds.length === 0) {
        return { error: "Daftar tagihan (billIds) wajib berupa array ID tagihan yang valid!" };
    }

    const validChannels = ['transfer', 'cash_to_rt', 'cash_to_bendahara'];
    if (!validChannels.includes(channel)) {
        return { error: "Metode pembayaran (channel) tidak valid! Pilihan: transfer, cash_to_rt, cash_to_bendahara" };
    }

    if (channel === 'transfer' && !proofUrl) {
        return { error: "Bukti transfer (proofUrl/file) wajib diunggah untuk pembayaran transfer!" };
    }

    const totalAmount = parseFloat(amountStated);
    if (isNaN(totalAmount) || totalAmount <= 0) {
        return { error: "Nominal pembayaran (amountStated) harus berupa angka valid positif!" };
    }

    const ownsTransaction = !executor;
    const connection = executor || await pool.getConnection();
    const savepointName = ownsTransaction
        ? null
        : `sp_submit_ipl_payment_${++submitPaymentSavepointCounter}`;
    let transactionStarted = false;
    let savepointCreated = false;

    try {
        if (ownsTransaction) {
            await connection.beginTransaction();
            transactionStarted = true;
        }

        // 1. Lock dan ambil seluruh tagihan dengan Pessimistic Lock
        const bills = await getBillsByIdsForUpdate(targetBillIds, connection);
        if (bills.length !== targetBillIds.length) {
            if (transactionStarted) {
                await connection.rollback();
                transactionStarted = false;
            }
            return { error: "Satu atau lebih tagihan yang dipilih tidak ditemukan di database!" };
        }

        // 2. Validasi kepemilikan tagihan (semua tagihan harus milik KK yang sama)
        const primaryFamilyId = bills[0].family_id;

        for (const b of bills) {
            // Validasi cross-family: tagihan harus milik familyId yang login
            if (familyId && String(b.family_id) !== String(familyId)) {
                if (transactionStarted) {
                    await connection.rollback();
                    transactionStarted = false;
                }
                return { error: "Akses ditolak: Satu atau lebih tagihan yang dipilih bukan milik keluarga Anda!" };
            }
            if (primaryFamilyId && String(b.family_id) !== String(primaryFamilyId)) {
                if (transactionStarted) {
                    await connection.rollback();
                    transactionStarted = false;
                }
                return { error: "Seluruh tagihan yang dirapel harus milik keluarga / KK yang sama!" };
            }
            if (b.status === 'paid') {
                if (transactionStarted) {
                    await connection.rollback();
                    transactionStarted = false;
                }
                return { error: `Tagihan #${b.id} (${b.period_title || 'IPL'}) sudah lunas sebelumnya!` };
            }
            if (b.status === 'exempt') {
                if (transactionStarted) {
                    await connection.rollback();
                    transactionStarted = false;
                }
                return { error: `Tagihan #${b.id} (${b.period_title || 'IPL'}) telah dibebaskan (exempt)!` };
            }

            // Cek apakah tagihan ini sedang menunggu verifikasi pada payment pending lain
            const isPending = await isBillInPendingPayment(b.id, connection);
            if (isPending) {
                if (transactionStarted) {
                    await connection.rollback();
                    transactionStarted = false;
                }
                return { error: `Tagihan #${b.id} (${b.period_title || 'IPL'}) saat ini sedang dalam proses verifikasi pending!` };
            }
        }

        // 3. Validasi kesesuaian nominal: totalAmount harus persis = SUM(allocated_amount)
        const expectedTotal = bills.reduce((sum, b) => sum + parseFloat(b.amount), 0);
        if (Math.abs(totalAmount - expectedTotal) > 0.01) {
            if (transactionStarted) {
                await connection.rollback();
                transactionStarted = false;
            }
            return {
                error: `Total nominal transfer (Rp ${totalAmount.toLocaleString('id-ID')}) tidak sesuai dengan total tagihan yang dipilih (Rp ${expectedTotal.toLocaleString('id-ID')})!`
            };
        }

        const targetFamilyId = familyId || primaryFamilyId;
        const billAllocations = bills.map(b => ({
            billId: b.id,
            allocatedAmount: parseFloat(b.amount)
        }));

        if (savepointName) {
            await connection.query(`SAVEPOINT ${savepointName}`);
            savepointCreated = true;
        }

        // 4. Proses berdasarkan channel pembayaran
        if (channel === 'cash_to_bendahara') {
            // Tunai langsung diterima bendahara -> otomatis approved & paid
            const now = new Date();
            const payResult = await createPaymentWithLinks({
                familyId: targetFamilyId,
                totalAmount,
                channel,
                proofUrl: proofUrl || 'cash_in_hand',
                status: 'approved',
                recordedBy,
                verifiedBy: recordedBy,
                verifiedAt: now,
                billAllocations
            }, connection);

            // Update status seluruh bills menjadi 'paid'
            await updateMultipleBillStatus(targetBillIds, 'paid', connection);

            // Catat ke Buku Kas RT (financial_ledger)
            const periodTitles = bills.map(b => b.period_title || `#${b.id}`).join(", ");
            const ledgerDesc = `Pembayaran IPL Tunai Bendahara [${periodTitles}] (KK ID ${targetFamilyId})`;
            await writeLedgerEntry({
                type: 'in',
                amount: totalAmount,
                sourceType: 'ipl',
                description: ledgerDesc
            }, connection);

            if (ownsTransaction) {
                await connection.commit();
                transactionStarted = false;
            } else if (savepointCreated) {
                await connection.query(`RELEASE SAVEPOINT ${savepointName}`);
                savepointCreated = false;
            }

            return {
                message: `Pembayaran tunai ${targetBillIds.length} bulan berhasil dicatat dan diverifikasi (Lunas)`,
                payment_id: payResult.insertId,
                bill_ids: targetBillIds,
                total_amount: totalAmount,
                bill_status: "paid"
            };
        } else {
            // Transfer atau Cash via RT -> Masuk antrean pending verifikasi bendahara
            const payResult = await createPaymentWithLinks({
                familyId: targetFamilyId,
                totalAmount,
                channel,
                proofUrl,
                status: 'pending',
                recordedBy,
                billAllocations
            }, connection);

            // Update status seluruh bills menjadi 'waiting_verification'
            await updateMultipleBillStatus(targetBillIds, 'waiting_verification', connection);

            if (ownsTransaction) {
                await connection.commit();
                transactionStarted = false;
            } else if (savepointCreated) {
                await connection.query(`RELEASE SAVEPOINT ${savepointName}`);
                savepointCreated = false;
            }

            return {
                message: `Bukti pembayaran ${targetBillIds.length} bulan berhasil dikirim, menunggu verifikasi Bendahara`,
                payment_id: payResult.insertId,
                bill_ids: targetBillIds,
                total_amount: totalAmount,
                bill_status: "waiting_verification"
            };
        }
    } catch (err) {
        if (transactionStarted) {
            try {
                await connection.rollback();
            } catch (rollbackErr) {
                console.error("error rollback submitPaymentService:", rollbackErr);
            }
            transactionStarted = false;
        } else if (savepointCreated) {
            try {
                await connection.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
            } catch (rollbackErr) {
                console.error("error rollback savepoint submitPaymentService:", rollbackErr);
            }

            try {
                await connection.query(`RELEASE SAVEPOINT ${savepointName}`);
            } catch (releaseErr) {
                console.error("error release savepoint submitPaymentService:", releaseErr);
            }
        }

        console.error("error submitPaymentService:", err);
        return { error: "Gagal memproses pembayaran: " + err.message };
    } finally {
        if (ownsTransaction) {
            connection.release();
        }
    }
}

/**
 * 5. Verifikasi Pembayaran IPL oleh Bendahara (Approve / Reject)
 */
export async function verifyPaymentService({ paymentId, decision, actorId, rejectReason = null }, executor = undefined) {
    const validDecisions = ['approved', 'rejected'];
    if (!validDecisions.includes(decision)) {
        return { error: "Keputusan verifikasi tidak valid! Harus 'approved' atau 'rejected'." };
    }

    if (decision === 'rejected' && (!rejectReason || !rejectReason.trim())) {
        return { error: "Alasan penolakan (rejectReason) wajib diisi saat menolak pembayaran!" };
    }

    const ownsTransaction = !executor;
    const connection = executor || await pool.getConnection();
    const savepointName = ownsTransaction
        ? null
        : `sp_verify_ipl_payment_${++verifyPaymentSavepointCounter}`;
    let transactionStarted = false;
    let savepointCreated = false;

    try {
        if (ownsTransaction) {
            await connection.beginTransaction();
            transactionStarted = true;
        }

        // 1. Lock payment row
        const payment = await getPaymentByIdForUpdate(paymentId, connection);
        if (!payment) {
            if (transactionStarted) {
                await connection.rollback();
                transactionStarted = false;
            }
            return { error: "Data pembayaran tidak ditemukan!" };
        }

        if (payment.status !== 'pending') {
            if (transactionStarted) {
                await connection.rollback();
                transactionStarted = false;
            }
            return { error: `Pembayaran ini sudah pernah diproses sebelumnya (Status: ${payment.status})!` };
        }

        // 2. Ambil seluruh link tagihan untuk payment ini
        const links = await getPaymentLinksByPaymentId(paymentId, connection);
        if (!links || links.length === 0) {
            if (transactionStarted) {
                await connection.rollback();
                transactionStarted = false;
            }
            return { error: "Pembayaran ini tidak memiliki tagihan yang terhubung!" };
        }

        const billIds = links.map(l => l.bill_id);
        const lockedBills = await getBillsByIdsForUpdate(billIds, connection);
        const billMap = new Map(lockedBills.map(b => [b.id, b]));
        const now = new Date();

        if (savepointName) {
            await connection.query(`SAVEPOINT ${savepointName}`);
            savepointCreated = true;
        }

        if (decision === 'approved') {
            // Guard & Validasi Wajib:
            let hasMismatch = false;
            for (const link of links) {
                const targetBill = billMap.get(link.bill_id);
                if (!targetBill) {
                    hasMismatch = true;
                    break;
                }
                if (Math.abs(parseFloat(link.allocated_amount) - parseFloat(targetBill.amount)) > 0.01) {
                    hasMismatch = true;
                    break;
                }
                if (targetBill.status === 'paid' || targetBill.status === 'exempt') {
                    hasMismatch = true;
                    break;
                }
            }

            // Jika ada mismatch, tolak seluruh payment secara otomatis
            if (hasMismatch) {
                const autoRejectReason = "nominal tidak sesuai pada salah satu tagihan";
                await updatePaymentVerification(paymentId, {
                    status: 'rejected',
                    rejectReason: autoRejectReason,
                    verifiedBy: actorId,
                    verifiedAt: now
                }, connection);

                // Re-check status tepat sebelum mutation dengan lock transaksi yang sama.
                // Tagihan exempt beserta metadata pembebasannya harus tetap dipertahankan.
                const resettableBillIds = await getResettableBillIdsForUpdate(billIds, connection);
                if (resettableBillIds.length > 0) {
                    await updateMultipleBillStatus(resettableBillIds, 'unpaid', connection);
                }

                if (ownsTransaction) {
                    await connection.commit();
                    transactionStarted = false;
                }

                // Notifikasi in-app penolakan otomatis
                try {
                    await createNotification({
                        familyId: payment.family_id,
                        type: "ipl",
                        title: "Pembayaran IPL Ditolak",
                        message: `Pembayaran IPL Anda sebesar Rp ${Number(payment.total_amount).toLocaleString('id-ID')} ditolak otomatis karena nominal tidak sesuai pada salah satu tagihan.`,
                        referenceType: "payment",
                        referenceId: paymentId,
                        emitRealtime: ownsTransaction
                    }, ownsTransaction ? undefined : connection);
                } catch (ne) {
                    console.error("Non-blocking error notifikasi auto-reject IPL:", ne.message);
                }

                if (!ownsTransaction && savepointCreated) {
                    await connection.query(`RELEASE SAVEPOINT ${savepointName}`);
                    savepointCreated = false;
                }

                return {
                    message: "Pembayaran otomatis ditolak karena nominal tidak sesuai pada salah satu tagihan.",
                    payment_id: paymentId,
                    bill_ids: billIds,
                    status: "rejected",
                    reject_reason: autoRejectReason
                };
            }

            // 1. Update status payment menjadi 'approved'
            await updatePaymentVerification(paymentId, {
                status: 'approved',
                rejectReason: null,
                verifiedBy: actorId,
                verifiedAt: now
            }, connection);

            // 2. Update seluruh bills terkait menjadi 'paid'
            await updateMultipleBillStatus(billIds, 'paid', connection);

            // 3. Catat pemasukan ke Buku Kas RT (financial_ledger)
            const periodTitles = links.map(l => l.period_title || `#${l.bill_id}`).join(", ");
            const ledgerDesc = `Pembayaran IPL Terverifikasi [${periodTitles}] (KK ID ${payment.family_id})`;
            await writeLedgerEntry({
                type: 'in',
                amount: payment.total_amount,
                sourceType: 'ipl',
                description: ledgerDesc
            }, connection);

            if (ownsTransaction) {
                await connection.commit();
                transactionStarted = false;
            }

            // Notifikasi in-app persetujuan pembayaran Lunas
            try {
                await createNotification({
                    familyId: payment.family_id,
                    type: "ipl",
                    title: "Pembayaran IPL Disetujui (Lunas)",
                    message: `Pembayaran IPL Anda sebesar Rp ${Number(payment.total_amount).toLocaleString('id-ID')} untuk tagihan [${periodTitles}] telah disetujui (Lunas). Terima kasih!`,
                    referenceType: "payment",
                    referenceId: paymentId,
                    emitRealtime: ownsTransaction
                }, ownsTransaction ? undefined : connection);
            } catch (ne) {
                console.error("Non-blocking error notifikasi approve IPL:", ne.message);
            }

            if (!ownsTransaction && savepointCreated) {
                await connection.query(`RELEASE SAVEPOINT ${savepointName}`);
                savepointCreated = false;
            }

            return {
                message: `Pembayaran ${billIds.length} tagihan berhasil disetujui (Approved). Status tagihan kini LUNAS.`,
                payment_id: paymentId,
                bill_ids: billIds,
                status: "approved"
            };
        } else {
            // Keputusan REJECTED
            await updatePaymentVerification(paymentId, {
                status: 'rejected',
                rejectReason: rejectReason.trim(),
                verifiedBy: actorId,
                verifiedAt: now
            }, connection);

            // Re-check status tepat sebelum mutation dengan lock transaksi yang sama.
            // Tagihan exempt beserta metadata pembebasannya harus tetap dipertahankan.
            const resettableBillIds = await getResettableBillIdsForUpdate(billIds, connection);
            if (resettableBillIds.length > 0) {
                await updateMultipleBillStatus(resettableBillIds, 'unpaid', connection);
            }

            if (ownsTransaction) {
                await connection.commit();
                transactionStarted = false;
            }

            // ⭐ PRIORITAS: Notifikasi in-app penolakan pembayaran IPL dengan rejectReason
            try {
                await createNotification({
                    familyId: payment.family_id,
                    type: "ipl",
                    title: "Pembayaran IPL Ditolak",
                    message: `Pembayaran IPL Anda sebesar Rp ${Number(payment.total_amount).toLocaleString('id-ID')} ditolak oleh Bendahara. Alasan: ${rejectReason.trim()}`,
                    referenceType: "payment",
                    referenceId: paymentId,
                    emitRealtime: ownsTransaction
                }, ownsTransaction ? undefined : connection);
            } catch (ne) {
                console.error("Non-blocking error notifikasi reject IPL:", ne.message);
            }

            if (!ownsTransaction && savepointCreated) {
                await connection.query(`RELEASE SAVEPOINT ${savepointName}`);
                savepointCreated = false;
            }

            return {
                message: "Pembayaran telah ditolak (Rejected). Status tagihan non-exempt kembali UNPAID.",
                payment_id: paymentId,
                bill_ids: billIds,
                status: "rejected",
                reject_reason: rejectReason.trim()
            };
        }
    } catch (err) {
        if (transactionStarted) {
            try {
                await connection.rollback();
            } catch (rollbackErr) {
                console.error("error rollback verifyPaymentService:", rollbackErr);
            }
            transactionStarted = false;
        } else if (savepointCreated) {
            try {
                await connection.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
            } catch (rollbackErr) {
                console.error("error rollback savepoint verifyPaymentService:", rollbackErr);
            }

            try {
                await connection.query(`RELEASE SAVEPOINT ${savepointName}`);
            } catch (releaseErr) {
                console.error("error release savepoint verifyPaymentService:", releaseErr);
            }
        }

        console.error("error verifyPaymentService:", err);
        return { error: "Gagal memverifikasi pembayaran: " + err.message };
    } finally {
        if (ownsTransaction) {
            connection.release();
        }
    }
}

/**
 * 6. Set Pembebasan Tagihan (Exempt) — Khusus RT / Bendahara
 */
export async function setExemptService(billId, reason, actorId, executor = pool) {
    if (!reason || !reason.trim()) {
        return { error: "Alasan pembebasan tagihan (reason) wajib diisi masbro!" };
    }

    try {
        const bill = await getBillById(billId, executor);
        if (!bill) {
            return { error: "Tagihan tidak ditemukan!" };
        }
        if (bill.status === 'paid') {
            return { error: "Tagihan yang sudah lunas tidak dapat dibebaskan!" };
        }

        await setBillExempt(billId, reason.trim(), actorId, executor);

        const updatedBill = await getBillById(billId, executor);
        return {
            message: `Tagihan #${billId} berhasil dibebaskan (Exempt).`,
            bill: updatedBill
        };
    } catch (err) {
        console.error("error setExemptService:", err);
        return { error: "Gagal membebaskan tagihan: " + err.message };
    }
}

/**
 * 7. Mengambil Rekapitulasi Tagihan per Periode untuk Bendahara
 */
export async function getPeriodSummaryService(billPeriodId, executor = pool) {
    try {
        const period = await getBillPeriodById(billPeriodId, executor);
        if (!period) {
            return { error: "Periode tagihan tidak ditemukan!" };
        }
        const summary = await getBillsSummaryByPeriodId(billPeriodId, executor);
        return {
            period,
            summary
        };
    } catch (err) {
        console.error("error getPeriodSummaryService:", err);
        return { error: "Gagal mengambil rekapitulasi periode: " + err.message };
    }
}

/**
 * 8. Mengambil Daftar Tagihan Keluarga Sendiri (Family-Gate)
 */
export async function getMyBillsService(userId, filters = {}, executor = pool) {
    try {
        const userData = await getAccountById(userId, executor);
        if (!userData || userData.length === 0) {
            return { error: "Akun warga tidak ditemukan!" };
        }
        const familyId = userData[0].family_id;
        if (!familyId) {
            return { error: "Akun Anda belum terhubung dengan Kartu Keluarga (family_id)!" };
        }

        const bills = await getBillsByFamilyId(familyId, filters, executor);
        return bills;
    } catch (err) {
        console.error("error getMyBillsService:", err);
        return { error: "Gagal mengambil tagihan keluarga: " + err.message };
    }
}

/**
 * Mengambil tagihan IPL unpaid untuk KK yang dipilih pengurus.
 * Query tagihan tetap memakai source of truth getBillsByFamilyId.
 */
export async function getOutstandingBillsByFamilyService(familyId, executor = pool) {
    const targetFamilyId = normalizePositiveInteger(familyId);
    if (!targetFamilyId) {
        return { error: "ID Kartu Keluarga (familyId) tidak valid!" };
    }

    try {
        return await getBillsByFamilyId(targetFamilyId, { status: "unpaid" }, executor);
    } catch (err) {
        console.error("error getOutstandingBillsByFamilyService:", err);
        return { error: "Gagal mengambil tagihan IPL yang belum lunas: " + err.message };
    }
}

/**
 * Pencatatan pembayaran IPL tunai yang diinisiasi pengurus.
 *
 * Nominal selalu dihitung dari bill yang dikunci di database. Transisi payment
 * dan bill didelegasikan ke submitPaymentService agar aturan status pembayaran
 * tetap memiliki satu source of truth. Audit ikut dalam transaksi yang sama.
 */
export async function recordCashPaymentService({
    familyId,
    billIds,
    actorId,
    actorRole = null,
    actorUsername = null,
    ipAddress = null,
    userAgent = null
}, executor = undefined) {
    const targetFamilyId = normalizePositiveInteger(familyId);
    if (!targetFamilyId) {
        return { error: "ID Kartu Keluarga (familyId) tidak valid!", statusCode: 400 };
    }

    const targetBillIds = normalizeCashBillIds(billIds);
    if (targetBillIds.length === 0 || targetBillIds.length !== billIds.length) {
        return {
            error: "Daftar tagihan (billIds) wajib berupa array ID unik yang valid!",
            statusCode: 400
        };
    }

    const targetActorId = normalizePositiveInteger(actorId);
    if (!targetActorId) {
        return { error: "Akun pengurus yang memproses pembayaran tidak valid!", statusCode: 400 };
    }

    const ownsTransaction = !executor;
    const connection = executor || await pool.getConnection();
    const savepointName = ownsTransaction
        ? null
        : `sp_record_ipl_cash_${++recordCashPaymentSavepointCounter}`;
    let transactionStarted = false;
    let savepointCreated = false;

    try {
        if (ownsTransaction) {
            await connection.beginTransaction();
            transactionStarted = true;
        } else {
            await connection.query(`SAVEPOINT ${savepointName}`);
            savepointCreated = true;
        }

        // Lock untuk memperoleh nominal authoritative dan menjaga konsistensi
        // sampai submitPaymentService menyelesaikan transisi status.
        const bills = await getBillsByIdsForUpdate(targetBillIds, connection);
        if (bills.length !== targetBillIds.length) {
            if (transactionStarted) {
                await connection.rollback();
                transactionStarted = false;
            } else if (savepointCreated) {
                await connection.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
                await connection.query(`RELEASE SAVEPOINT ${savepointName}`);
                savepointCreated = false;
            }
            return {
                error: "Satu atau lebih tagihan yang dipilih tidak ditemukan di database!",
                statusCode: 404
            };
        }

        const totalAmount = bills.reduce((sum, bill) => sum + Number(bill.amount), 0);
        const paymentResult = await submitPaymentService({
            billIds: targetBillIds,
            familyId: targetFamilyId,
            amountStated: totalAmount,
            channel: "cash_to_bendahara",
            recordedBy: targetActorId
        }, connection);

        if (paymentResult.error) {
            if (transactionStarted) {
                await connection.rollback();
                transactionStarted = false;
            } else if (savepointCreated) {
                await connection.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
                await connection.query(`RELEASE SAVEPOINT ${savepointName}`);
                savepointCreated = false;
            }
            return { ...paymentResult, statusCode: 409 };
        }

        await writeCashPaymentAudit(connection, {
            actorId: targetActorId,
            actorRole,
            actorUsername,
            ipAddress,
            userAgent,
            familyId: targetFamilyId,
            billIds: targetBillIds,
            paymentId: paymentResult.payment_id,
            totalAmount
        });

        if (ownsTransaction) {
            await connection.commit();
            transactionStarted = false;
        } else {
            await connection.query(`RELEASE SAVEPOINT ${savepointName}`);
            savepointCreated = false;
        }

        return {
            ...paymentResult,
            message: `Setoran tunai untuk ${targetBillIds.length} tagihan IPL berhasil dicatat (Lunas)`,
            family_id: targetFamilyId,
            payment_method: "cash_to_bendahara"
        };
    } catch (err) {
        if (transactionStarted) {
            try {
                await connection.rollback();
            } catch (rollbackErr) {
                console.error("error rollback recordCashPaymentService:", rollbackErr);
            }
        } else if (savepointCreated) {
            try {
                await connection.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
                await connection.query(`RELEASE SAVEPOINT ${savepointName}`);
            } catch (rollbackErr) {
                console.error("error rollback savepoint recordCashPaymentService:", rollbackErr);
            }
        }

        console.error("error recordCashPaymentService:", err);
        return { error: "Gagal mencatat setoran tunai IPL: " + err.message, statusCode: 500 };
    } finally {
        if (ownsTransaction) connection.release();
    }
}

/**
 * 9. Mengambil Detail Tagihan Spesifik (dengan Validasi Hak Akses Family-Gate untuk Warga)
 */
export async function getBillDetailWithAuthService(billId, userId, userRole, executor = pool) {
    try {
        const bill = await getBillById(billId, executor);
        if (!bill) {
            return { error: "Tagihan tidak ditemukan!" };
        }

        // Jika warga, pastikan tagihan adalah milik keluarganya
        if (userRole === 'warga') {
            const userData = await getAccountById(userId, executor);
            const familyId = userData && userData[0] ? userData[0].family_id : null;
            if (!familyId || String(familyId) !== String(bill.family_id)) {
                return { unauthorized: true, error: "Akses ditolak, ini bukan tagihan keluarga lu cuy!" };
            }
        }

        const payments = await getPaymentsByBillId(billId, executor);
        return {
            bill,
            payments
        };
    } catch (err) {
        console.error("error getBillDetailWithAuthService:", err);
        return { error: "Gagal mengambil detail tagihan: " + err.message };
    }
}

/**
 * 10. Mengambil Daftar Pembayaran Pending untuk Verifikasi Bendahara
 */
export async function getPendingPaymentsService(filters, executor = pool) {
    try {
        const list = await getPendingPaymentsList(filters, executor);
        return list;
    } catch (err) {
        console.error("error getPendingPaymentsService:", err);
        return { error: "Gagal mengambil daftar pending payments: " + err.message };
    }
}

/**
 * 11. Mengambil Audit Trail Pembayaran untuk RT / Superadmin / Bendahara
 */
export async function getPaymentAuditService(filters, executor = pool) {
    try {
        const list = await getPaymentAuditList(filters, executor);
        return list;
    } catch (err) {
        console.error("error getPaymentAuditService:", err);
        return { error: "Gagal mengambil audit trail payments: " + err.message };
    }
}
