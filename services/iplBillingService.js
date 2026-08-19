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
    getBillByIdForUpdate,
    getBillsByResident,
    getBillsByFamilyId,
    getBillsByPeriodId,
    updateBillStatus,
    setBillExempt,
    getBillsSummaryByPeriodId,
    computeBillStatus
} from "../models/billModel.js";
import {
    createPayment,
    getPaymentById,
    getPaymentByIdForUpdate,
    getPaymentsByBillId,
    getPendingPaymentsList,
    getPaymentAuditList,
    updatePaymentVerification,
    hasApprovedPayment
} from "../models/paymentModel.js";
import { insertLedger } from "../models/financial.js";
import { getAccountById } from "../models/login.js";

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
 * 3. Publish Periode Tagihan — Generate Snapshot Bills untuk Seluruh Warga Aktif
 * Idempotent: jika sudah dipublish, tidak akan double-generate tagihan.
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

        // 2. Ambil seluruh warga aktif
        // Sesuai sistem RT: warga yang status datanya diterima dan hidup
        const [activeResidents] = await connection.execute(`
            SELECT w.id AS resident_id, w.nama, w.family_id
            FROM warga w
            WHERE (w.status_data = 'diterima' OR w.status_data IS NULL)
              AND (w.status_hidup = 'Hidup' OR w.status_hidup IS NULL)
            ORDER BY w.id ASC
        `);

        if (!activeResidents || activeResidents.length === 0) {
            await connection.rollback();
            return { error: "Tidak ada warga aktif yang ditemukan untuk diterbitkan tagihan!" };
        }

        // 3. Siapkan data batch bills (snapshot amount & due_date)
        const billsToInsert = activeResidents.map(r => ({
            bill_period_id: period.id,
            resident_id: r.resident_id,
            amount: period.default_amount,
            due_date: period.due_date,
            status: 'unpaid'
        }));

        // 4. Batch insert dengan INSERT IGNORE
        await createBatchBills(billsToInsert, connection);

        // 5. Update status periode menjadi 'published'
        await updateBillPeriodStatus(period.id, 'published', connection);

        await connection.commit();

        const summary = await getBillsSummaryByPeriodId(period.id);
        return {
            message: `Tagihan "${period.title}" berhasil dipublish untuk ${activeResidents.length} warga aktif!`,
            period_id: period.id,
            total_bills_generated: activeResidents.length,
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
 * 4. Submit Pembayaran (Warga atau Pengurus)
 * - Channel 'cash_to_bendahara': Langsung APPROVED & Bill PAID + Catat ke Buku Kas Ledger
 * - Channel 'transfer' atau 'cash_to_rt': Status PENDING & Bill WAITING_VERIFICATION
 */
export async function submitPaymentService({ billId, residentId, amountStated, channel, proofUrl = null, recordedBy = null }) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Lock dan cek bill
        const bill = await getBillByIdForUpdate(billId, connection);
        if (!bill) {
            await connection.rollback();
            return { error: "Tagihan tidak ditemukan masbro!" };
        }

        if (bill.status === 'paid') {
            await connection.rollback();
            return { error: "Tagihan ini sudah lunas, tidak dapat menerima pembayaran baru!" };
        }
        if (bill.status === 'exempt') {
            await connection.rollback();
            return { error: "Tagihan ini telah dibebaskan (exempt), tidak perlu dibayar!" };
        }

        // Cek apakah sudah ada pembayaran yang sedang pending untuk tagihan ini
        const [pendingPayments] = await connection.execute(
            "SELECT id FROM payments WHERE bill_id = ? AND status = 'pending' LIMIT 1",
            [billId]
        );
        if (pendingPayments.length > 0) {
            await connection.rollback();
            return { error: "Masih ada bukti pembayaran yang sedang menunggu verifikasi bendahara untuk tagihan ini!" };
        }

        const validChannels = ['transfer', 'cash_to_rt', 'cash_to_bendahara'];
        if (!validChannels.includes(channel)) {
            await connection.rollback();
            return { error: "Metode pembayaran (channel) tidak valid! Pilihan: transfer, cash_to_rt, cash_to_bendahara" };
        }

        if (channel === 'transfer' && !proofUrl) {
            await connection.rollback();
            return { error: "Bukti transfer (proofUrl/file) wajib diunggah untuk pembayaran transfer!" };
        }

        const amount = parseFloat(amountStated);
        if (isNaN(amount) || amount <= 0) {
            await connection.rollback();
            return { error: "Nominal pembayaran (amountStated) harus berupa angka valid positif!" };
        }

        const targetResidentId = residentId || bill.resident_id;

        // 2. Alur berdasarkan channel
        if (channel === 'cash_to_bendahara') {
            // Tunai langsung diterima bendahara -> otomatis approved & paid
            const now = new Date();
            const payResult = await createPayment({
                billId,
                residentId: targetResidentId,
                amountStated: amount,
                channel,
                proofUrl: proofUrl || 'cash_in_hand',
                status: 'approved',
                recordedBy,
                verifiedBy: recordedBy,
                verifiedAt: now
            }, connection);

            // Update status bill menjadi 'paid'
            await updateBillStatus(billId, 'paid', connection);

            // Catat ke Buku Kas Ledger
            const ledgerDesc = `Pembayaran IPL Tunai Bendahara (Tagihan #${billId}, Warga ID ${targetResidentId})`;
            await connection.execute(
                "INSERT INTO financial_ledger (id, type, amount, source_type, description) VALUES (NULL, 'in', ?, 'ipl', ?)",
                [amount, ledgerDesc]
            );

            await connection.commit();

            return {
                message: "Pembayaran tunai berhasil dicatat dan diverifikasi (Lunas)",
                payment_id: payResult.insertId,
                bill_status: "paid"
            };
        } else {
            // Transfer atau Cash via RT -> Masuk antrean pending verifikasi bendahara
            const payResult = await createPayment({
                billId,
                residentId: targetResidentId,
                amountStated: amount,
                channel,
                proofUrl,
                status: 'pending',
                recordedBy
            }, connection);

            // Update status bill menjadi 'waiting_verification'
            await updateBillStatus(billId, 'waiting_verification', connection);

            await connection.commit();

            return {
                message: "Bukti pembayaran berhasil dikirim, menunggu verifikasi Bendahara",
                payment_id: payResult.insertId,
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
 * 5. Verifikasi Pembayaran oleh Bendahara (Approve / Reject)
 * Dilindungi dengan Transaction + Pessimistic Lock (FOR UPDATE) untuk mencegah race condition.
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

        const billId = payment.bill_id;
        const now = new Date();

        if (decision === 'approved') {
            // Guard: Pastikan tidak ada payment approved lain untuk bill ini
            const alreadyApproved = await hasApprovedPayment(billId, connection);
            if (alreadyApproved) {
                await connection.rollback();
                return { error: "Tagihan ini sudah memiliki pembayaran yang disetujui (Approved)!" };
            }

            // 1. Update status payment menjadi 'approved'
            await updatePaymentVerification(paymentId, {
                status: 'approved',
                rejectReason: null,
                verifiedBy: actorId,
                verifiedAt: now
            }, connection);

            // 2. Update status bill menjadi 'paid'
            await updateBillStatus(billId, 'paid', connection);

            // 3. Catat pemasukan ke Buku Kas RT (financial_ledger)
            const ledgerDesc = `Pembayaran IPL Terverifikasi (Tagihan #${billId}, Warga ID ${payment.resident_id})`;
            await connection.execute(
                "INSERT INTO financial_ledger (id, type, amount, source_type, description) VALUES (NULL, 'in', ?, 'ipl', ?)",
                [payment.amount_stated, ledgerDesc]
            );

            await connection.commit();

            return {
                message: "Pembayaran berhasil disetujui (Approved). Status tagihan kini LUNAS.",
                payment_id: paymentId,
                bill_id: billId,
                status: "approved"
            };
        } else {
            // Keputusan REJECTED
            // 1. Update status payment menjadi 'rejected' dengan alasan
            await updatePaymentVerification(paymentId, {
                status: 'rejected',
                rejectReason: rejectReason.trim(),
                verifiedBy: actorId,
                verifiedAt: now
            }, connection);

            // 2. Kembalikan status bill ke 'unpaid' agar warga bisa upload ulang
            await updateBillStatus(billId, 'unpaid', connection);

            await connection.commit();

            return {
                message: "Pembayaran telah ditolak (Rejected). Status tagihan kembali UNPAID.",
                payment_id: paymentId,
                bill_id: billId,
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
 * 8. Mengambil Daftar Tagihan Warga Sendiri (Family-Gate)
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
