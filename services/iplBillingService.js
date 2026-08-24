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

/**
 * 1. Membuat Periode Tagihan Baru (Draft)
 */
export async function createBillPeriodService({ title, defaultAmount, dueDate, periodMonth, periodYear, createdBy }) {
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
        const existing = await getBillPeriodByMonthYear(month, year);
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
        });

        const createdPeriod = await getBillPeriodById(result.insertId);
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
export async function getAllBillPeriodsService(filters) {
    try {
        const periods = await getAllBillPeriods(filters);
        return periods;
    } catch (err) {
        console.error("error getAllBillPeriodsService:", err);
        return { error: "Gagal mengambil daftar periode tagihan: " + err.message };
    }
}

export async function getBillPeriodDetailService(id) {
    try {
        const period = await getBillPeriodById(id);
        if (!period) {
            return { error: "Periode tagihan tidak ditemukan!" };
        }
        const summary = await getBillsSummaryByPeriodId(id);
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
export async function publishBillPeriodService(billPeriodId, actorId) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Ambil data periode
        const [periodRows] = await connection.execute(
            "SELECT * FROM bill_periods WHERE id = ? FOR UPDATE",
            [billPeriodId]
        );
        if (periodRows.length === 0) {
            await connection.rollback();
            return { error: "Periode tagihan tidak ditemukan!" };
        }
        const period = periodRows[0];

        if (period.status === 'published') {
            await connection.rollback();
            return { error: "Periode tagihan ini sudah pernah dipublish sebelumnya!" };
        }

        // 2. Ambil seluruh keluarga (KK) aktif (1 KK = 1 tagihan per periode)
        const [activeFamilies] = await connection.execute(`
            SELECT f.id AS family_id
            FROM family f
            ORDER BY f.id ASC
        `);

        if (!activeFamilies || activeFamilies.length === 0) {
            await connection.rollback();
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

        // 4. Batch insert dengan INSERT IGNORE
        await createBatchBills(billsToInsert, connection);

        // 5. Update status periode menjadi 'published'
        await updateBillPeriodStatus(period.id, 'published', connection);

        await connection.commit();

        // Kirim notifikasi in-app ke seluruh keluarga aktif yang diterbitkan tagihan
        try {
            const familyIds = activeFamilies.map(f => f.family_id);
            await createBroadcastFamilyNotifications({
                familyIds,
                type: "ipl",
                title: `Tagihan IPL Baru: ${period.title}`,
                message: `Tagihan IPL untuk periode "${period.title}" sebesar Rp ${Number(period.default_amount).toLocaleString('id-ID')} telah diterbitkan. Jatuh tempo: ${period.due_date}.`,
                referenceType: "bill_period",
                referenceId: period.id
            });
        } catch (notifErr) {
            console.error("Non-blocking error notifikasi publish IPL:", notifErr.message);
        }

        const summary = await getBillsSummaryByPeriodId(period.id);
        return {
            message: `Tagihan "${period.title}" berhasil dipublish untuk ${activeFamilies.length} keluarga (KK)!`,
            period_id: period.id,
            total_bills_generated: activeFamilies.length,
            summary
        };
    } catch (err) {
        await connection.rollback();
        console.error("error publishBillPeriodService:", err);
        return { error: "Gagal mempublish tagihan: " + err.message };
    } finally {
        connection.release();
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
}) {
    // Normalisasi input billIds menjadi array number
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

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Lock dan ambil seluruh tagihan dengan Pessimistic Lock
        const bills = await getBillsByIdsForUpdate(targetBillIds, connection);
        if (bills.length !== targetBillIds.length) {
            await connection.rollback();
            return { error: "Satu atau lebih tagihan yang dipilih tidak ditemukan di database!" };
        }

        // 2. Validasi kepemilikan tagihan (semua tagihan harus milik KK yang sama)
        const primaryFamilyId = bills[0].family_id;

        for (const b of bills) {
            // Validasi cross-family: tagihan harus milik familyId yang login
            if (familyId && String(b.family_id) !== String(targetFamilyId)) {
                await connection.rollback();
                return { error: "Akses ditolak: Satu atau lebih tagihan yang dipilih bukan milik keluarga Anda!" };
            }
            if (primaryFamilyId && String(b.family_id) !== String(primaryFamilyId)) {
                await connection.rollback();
                return { error: "Seluruh tagihan yang dirapel harus milik keluarga / KK yang sama!" };
            }
            if (b.status === 'paid') {
                await connection.rollback();
                return { error: `Tagihan #${b.id} (${b.period_title || 'IPL'}) sudah lunas sebelumnya!` };
            }
            if (b.status === 'exempt') {
                await connection.rollback();
                return { error: `Tagihan #${b.id} (${b.period_title || 'IPL'}) telah dibebaskan (exempt)!` };
            }

            // Cek apakah tagihan ini sedang menunggu verifikasi pada payment pending lain
            const isPending = await isBillInPendingPayment(b.id, connection);
            if (isPending) {
                await connection.rollback();
                return { error: `Tagihan #${b.id} (${b.period_title || 'IPL'}) saat ini sedang dalam proses verifikasi pending!` };
            }
        }

        // 3. Validasi kesesuaian nominal: totalAmount harus persis = SUM(allocated_amount)
        const expectedTotal = bills.reduce((sum, b) => sum + parseFloat(b.amount), 0);
        if (Math.abs(totalAmount - expectedTotal) > 0.01) {
            await connection.rollback();
            return {
                error: `Total nominal transfer (Rp ${totalAmount.toLocaleString('id-ID')}) tidak sesuai dengan total tagihan yang dipilih (Rp ${expectedTotal.toLocaleString('id-ID')})!`
            };
        }

        const targetFamilyId = familyId || primaryFamilyId;
        const billAllocations = bills.map(b => ({
            billId: b.id,
            allocatedAmount: parseFloat(b.amount)
        }));

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
                description: ledgerDesc,
                connection
            });

            await connection.commit();

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

            await connection.commit();

            return {
                message: `Bukti pembayaran ${targetBillIds.length} bulan berhasil dikirim, menunggu verifikasi Bendahara`,
                payment_id: payResult.insertId,
                bill_ids: targetBillIds,
                total_amount: totalAmount,
                bill_status: "waiting_verification"
            };
        }
    } catch (err) {
        await connection.rollback();
        console.error("error submitPaymentService:", err);
        return { error: "Gagal memproses pembayaran: " + err.message };
    } finally {
        connection.release();
    }
}

/**
 * 5. Verifikasi Pembayaran IPL oleh Bendahara (Approve / Reject)
 */
export async function verifyPaymentService({ paymentId, decision, actorId, rejectReason = null }) {
    const validDecisions = ['approved', 'rejected'];
    if (!validDecisions.includes(decision)) {
        return { error: "Keputusan verifikasi tidak valid! Harus 'approved' atau 'rejected'." };
    }

    if (decision === 'rejected' && (!rejectReason || !rejectReason.trim())) {
        return { error: "Alasan penolakan (rejectReason) wajib diisi saat menolak pembayaran!" };
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Lock payment row
        const payment = await getPaymentByIdForUpdate(paymentId, connection);
        if (!payment) {
            await connection.rollback();
            return { error: "Data pembayaran tidak ditemukan!" };
        }

        if (payment.status !== 'pending') {
            await connection.rollback();
            return { error: `Pembayaran ini sudah pernah diproses sebelumnya (Status: ${payment.status})!` };
        }

        // 2. Ambil seluruh link tagihan untuk payment ini
        const links = await getPaymentLinksByPaymentId(paymentId, connection);
        if (!links || links.length === 0) {
            await connection.rollback();
            return { error: "Pembayaran ini tidak memiliki tagihan yang terhubung!" };
        }

        const billIds = links.map(l => l.bill_id);
        const lockedBills = await getBillsByIdsForUpdate(billIds, connection);
        const billMap = new Map(lockedBills.map(b => [b.id, b]));
        const now = new Date();

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

                // Kembalikan semua tagihan ke unpaid
                await updateMultipleBillStatus(billIds, 'unpaid', connection);

                await connection.commit();

                // Notifikasi in-app penolakan otomatis
                try {
                    await createNotification({
                        familyId: payment.family_id,
                        type: "ipl",
                        title: "Pembayaran IPL Ditolak",
                        message: `Pembayaran IPL Anda sebesar Rp ${Number(payment.total_amount).toLocaleString('id-ID')} ditolak otomatis karena nominal tidak sesuai pada salah satu tagihan.`,
                        referenceType: "payment",
                        referenceId: paymentId
                    });
                } catch (ne) {
                    console.error("Non-blocking error notifikasi auto-reject IPL:", ne.message);
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
                description: ledgerDesc,
                connection
            });

            await connection.commit();

            // Notifikasi in-app persetujuan pembayaran Lunas
            try {
                await createNotification({
                    familyId: payment.family_id,
                    type: "ipl",
                    title: "Pembayaran IPL Disetujui (Lunas)",
                    message: `Pembayaran IPL Anda sebesar Rp ${Number(payment.total_amount).toLocaleString('id-ID')} untuk tagihan [${periodTitles}] telah disetujui (Lunas). Terima kasih!`,
                    referenceType: "payment",
                    referenceId: paymentId
                });
            } catch (ne) {
                console.error("Non-blocking error notifikasi approve IPL:", ne.message);
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

            // Kembalikan seluruh bills terkait ke 'unpaid'
            await updateMultipleBillStatus(billIds, 'unpaid', connection);

            await connection.commit();

            // ⭐ PRIORITAS: Notifikasi in-app penolakan pembayaran IPL dengan rejectReason
            try {
                await createNotification({
                    familyId: payment.family_id,
                    type: "ipl",
                    title: "Pembayaran IPL Ditolak",
                    message: `Pembayaran IPL Anda sebesar Rp ${Number(payment.total_amount).toLocaleString('id-ID')} ditolak oleh Bendahara. Alasan: ${rejectReason.trim()}`,
                    referenceType: "payment",
                    referenceId: paymentId
                });
            } catch (ne) {
                console.error("Non-blocking error notifikasi reject IPL:", ne.message);
            }

            return {
                message: "Pembayaran telah ditolak (Rejected). Status seluruh tagihan kembali UNPAID.",
                payment_id: paymentId,
                bill_ids: billIds,
                status: "rejected",
                reject_reason: rejectReason.trim()
            };
        }
    } catch (err) {
        await connection.rollback();
        console.error("error verifyPaymentService:", err);
        return { error: "Gagal memverifikasi pembayaran: " + err.message };
    } finally {
        connection.release();
    }
}

/**
 * 6. Set Pembebasan Tagihan (Exempt) — Khusus RT / Bendahara
 */
export async function setExemptService(billId, reason, actorId) {
    if (!reason || !reason.trim()) {
        return { error: "Alasan pembebasan tagihan (reason) wajib diisi masbro!" };
    }

    try {
        const bill = await getBillById(billId);
        if (!bill) {
            return { error: "Tagihan tidak ditemukan!" };
        }
        if (bill.status === 'paid') {
            return { error: "Tagihan yang sudah lunas tidak dapat dibebaskan!" };
        }

        await setBillExempt(billId, reason.trim(), actorId);

        const updatedBill = await getBillById(billId);
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
export async function getPeriodSummaryService(billPeriodId) {
    try {
        const period = await getBillPeriodById(billPeriodId);
        if (!period) {
            return { error: "Periode tagihan tidak ditemukan!" };
        }
        const summary = await getBillsSummaryByPeriodId(billPeriodId);
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
export async function getMyBillsService(userId, filters = {}) {
    try {
        const userData = await getAccountById(userId);
        if (!userData || userData.length === 0) {
            return { error: "Akun warga tidak ditemukan!" };
        }
        const familyId = userData[0].family_id;
        if (!familyId) {
            return { error: "Akun Anda belum terhubung dengan Kartu Keluarga (family_id)!" };
        }

        const bills = await getBillsByFamilyId(familyId, filters);
        return bills;
    } catch (err) {
        console.error("error getMyBillsService:", err);
        return { error: "Gagal mengambil tagihan keluarga: " + err.message };
    }
}

/**
 * 9. Mengambil Detail Tagihan Spesifik (dengan Validasi Hak Akses Family-Gate untuk Warga)
 */
export async function getBillDetailWithAuthService(billId, userId, userRole) {
    try {
        const bill = await getBillById(billId);
        if (!bill) {
            return { error: "Tagihan tidak ditemukan!" };
        }

        // Jika warga, pastikan tagihan adalah milik keluarganya
        if (userRole === 'warga') {
            const userData = await getAccountById(userId);
            const familyId = userData && userData[0] ? userData[0].family_id : null;
            if (!familyId || String(familyId) !== String(bill.family_id)) {
                return { unauthorized: true, error: "Akses ditolak, ini bukan tagihan keluarga lu cuy!" };
            }
        }

        const payments = await getPaymentsByBillId(billId);
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
export async function getPendingPaymentsService(filters) {
    try {
        const list = await getPendingPaymentsList(filters);
        return list;
    } catch (err) {
        console.error("error getPendingPaymentsService:", err);
        return { error: "Gagal mengambil daftar pending payments: " + err.message };
    }
}

/**
 * 11. Mengambil Audit Trail Pembayaran untuk RT / Superadmin / Bendahara
 */
export async function getPaymentAuditService(filters) {
    try {
        const list = await getPaymentAuditList(filters);
        return list;
    } catch (err) {
        console.error("error getPaymentAuditService:", err);
        return { error: "Gagal mengambil audit trail payments: " + err.message };
    }
}
