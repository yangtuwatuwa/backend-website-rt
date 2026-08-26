import pool from "../config/sqlconfig.js";
import { initIplBillingTables } from "../utils/migrateIplBills.js";
import {
    createBillPeriodService,
    publishBillPeriodService,
    submitPaymentService,
    verifyPaymentService,
    setExemptService,
    getPeriodSummaryService,
    getMyBillsService,
    getBillDetailWithAuthService
} from "../services/iplBillingService.js";
import { computeBillStatus } from "../models/billModel.js";

/**
 * Test Runner untuk Modul Penagihan IPL
 */
async function runTests() {
    console.log("==========================================");
    console.log("🧪 MEMULAI TEST SUITE: MODUL PENAGIHAN IPL");
    console.log("==========================================\n");

    let passedTests = 0;
    let failedTests = 0;

    function assert(condition, message) {
        if (condition) {
            console.log(`  ✅ PASS: ${message}`);
            passedTests++;
        } else {
            console.error(`  ❌ FAIL: ${message}`);
            failedTests++;
        }
    }

    try {
        // 0. Inisialisasi Tabel
        console.log("1️⃣  Inisialisasi Tabel Database...");
        await initIplBillingTables();

        // Bersihkan data test lama jika ada
        await pool.query("SET FOREIGN_KEY_CHECKS = 0;");
        await pool.query("DELETE FROM payments WHERE id > 0;");
        await pool.query("DELETE FROM bills WHERE id > 0;");
        await pool.query("DELETE FROM bill_periods WHERE id > 0;");
        await pool.query("SET FOREIGN_KEY_CHECKS = 1;");

        // Pastikan ada dummy data warga & akun untuk pengetesan jika tabel kosong
        const [wargaCheck] = await pool.query("SELECT id FROM warga LIMIT 1;");
        let testResidentId = 1;
        let testFamilyId = 1;

        if (wargaCheck.length === 0) {
            console.log("ℹ️  Membuat dummy warga & family untuk test...");
            const [famRes] = await pool.query("INSERT INTO family (id, no_kk) VALUES (999, 'KK-TEST-001') ON DUPLICATE KEY UPDATE id=id;");
            testFamilyId = famRes.insertId || 999;
            const [wargaRes] = await pool.query(`
                INSERT INTO warga (id, nik, nama, family_id, status_data, status_hidup) 
                VALUES (999, 'NIK-TEST-001', 'Budi Pengujian', ?, 'diterima', 'Hidup')
                ON DUPLICATE KEY UPDATE id=id;
            `, [testFamilyId]);
            testResidentId = wargaRes.insertId || 999;
        } else {
            testResidentId = wargaCheck[0].id;
        }

        // Test 1: Unit Test Dynamic Overdue Status
        console.log("\n2️⃣  Test 1: Kalkulasi Status Overdue Secara Dinamis...");
        const pastBill = {
            id: 1,
            status: 'unpaid',
            due_date: '2020-01-01',
            amount: 200000
        };
        const computedPast = computeBillStatus(pastBill);
        assert(computedPast.is_overdue === true, "Tagihan dengan due_date lampau & status unpaid berstatus overdue");
        assert(computedPast.display_status === 'overdue', "display_status bernilai 'overdue'");

        const futureBill = {
            id: 2,
            status: 'unpaid',
            due_date: '2099-12-31',
            amount: 200000
        };
        const computedFuture = computeBillStatus(futureBill);
        assert(computedFuture.is_overdue === false, "Tagihan dengan due_date masa depan tidak overdue");
        assert(computedFuture.display_status === 'unpaid', "display_status tetap 'unpaid'");

        const paidPastBill = {
            id: 3,
            status: 'paid',
            due_date: '2020-01-01',
            amount: 200000
        };
        const computedPaidPast = computeBillStatus(paidPastBill);
        assert(computedPaidPast.is_overdue === false, "Tagihan yang sudah 'paid' tidak dihitung overdue meskipun tanggal lampau");
        assert(computedPaidPast.display_status === 'paid', "display_status tetap 'paid'");

        // Test 2: Membuat Periode Tagihan (Draft)
        console.log("\n3️⃣  Test 2: Membuat Periode Tagihan (Draft)...");
        const createRes = await createBillPeriodService({
            title: "IPL September 2026",
            defaultAmount: 250000,
            dueDate: "2026-09-10",
            periodMonth: 9,
            periodYear: 2026,
            createdBy: 1
        });
        assert(!createRes.error, "Periode tagihan draft berhasil dibuat");
        assert(createRes.period && createRes.period.status === 'draft', "Status awal periode adalah 'draft'");
        const periodId = createRes.period.id;

        // Test 2b: Pencegahan Duplikasi Periode pada Bulan/Tahun yang Sama
        const duplicateRes = await createBillPeriodService({
            title: "IPL September 2026 Dobel",
            defaultAmount: 250000,
            dueDate: "2026-09-10",
            periodMonth: 9,
            periodYear: 2026,
            createdBy: 1
        });
        assert(duplicateRes.error !== undefined, "Pembuatan periode duplikat bulan/tahun yang sama ditolak");

        // Test 3: Publish Periode Tagihan — Generate Snapshot Bills
        console.log("\n4️⃣  Test 3: Publish Tagihan (Snapshot Amount & Due Date)...");
        const publishRes = await publishBillPeriodService(periodId, 1);
        assert(!publishRes.error, "Periode tagihan berhasil di-publish");
        assert(publishRes.total_bills_generated > 0, `Berhasil meng-generate ${publishRes.total_bills_generated} tagihan`);

        // Test 3b: Idempotensi Publish
        const doublePublish = await publishBillPeriodService(periodId, 1);
        assert(doublePublish.error !== undefined, "Double publish periode yang sama ditolak (Idempotent guard)");

        // Ambil salah satu tagihan yang terbentuk
        const [billRows] = await pool.query("SELECT * FROM bills WHERE bill_period_id = ? LIMIT 1;", [periodId]);
        assert(billRows.length > 0, "Row tagihan berhasil tersimpan di tabel bills");
        const targetBill = billRows[0];
        assert(Number(targetBill.amount) === 250000, "Nominal tagihan di-snapshot 250.000 sesuai default_amount periode");
        assert(targetBill.status === 'unpaid', "Status awal tagihan adalah 'unpaid'");

        // Test 4: Submit Pembayaran Channel Transfer (Pending Verification)
        console.log("\n5️⃣  Test 4: Submit Pembayaran Transfer (Waiting Verification)...");
        const submitTransferRes = await submitPaymentService({
            billId: targetBill.id,
            familyId: targetBill.family_id,
            amountStated: 250000,
            channel: 'transfer',
            proofUrl: 'bukti_transfer_sample.jpg',
            recordedBy: 1
        });
        assert(!submitTransferRes.error, "Submit bukti transfer berhasil");
        assert(submitTransferRes.bill_status === 'waiting_verification', "Status tagihan berubah menjadi 'waiting_verification'");
        const paymentId = submitTransferRes.payment_id;

        // Test 4b: Guard Mencegah Submit Dobel saat Masih Pending
        const doubleSubmit = await submitPaymentService({
            billId: targetBill.id,
            familyId: targetBill.family_id,
            amountStated: 250000,
            channel: 'transfer',
            proofUrl: 'bukti_kedua.jpg',
            recordedBy: 1
        });
        assert(doubleSubmit.error !== undefined, "Submit pembayaran ditolak jika masih ada pembayaran pending untuk tagihan tersebut");

        // Test 5: Verifikasi Pembayaran — Reject Flow
        console.log("\n6️⃣  Test 5: Verifikasi Pembayaran (Reject & Revert to Unpaid)...");
        const rejectRes = await verifyPaymentService({
            paymentId: paymentId,
            decision: 'rejected',
            actorId: 2,
            rejectReason: 'Foto bukti tidak jelas'
        });
        assert(!rejectRes.error, "Penolakan pembayaran oleh bendahara berhasil diproses");
        assert(rejectRes.status === 'rejected', "Status pembayaran menjadi 'rejected'");

        // Verifikasi status tagihan kembali ke unpaid
        const [revertedBill] = await pool.query("SELECT status FROM bills WHERE id = ?;", [targetBill.id]);
        assert(revertedBill[0].status === 'unpaid', "Status tagihan berhasil di-revert kembali ke 'unpaid' setelah di-reject");

        // Test 6: Resubmit Pembayaran & Approval
        console.log("\n7️⃣  Test 6: Resubmit & Approval oleh Bendahara (Paid & Ledger Entry)...");
        const resubmitRes = await submitPaymentService({
            billId: targetBill.id,
            familyId: targetBill.family_id,
            amountStated: 250000,
            channel: 'transfer',
            proofUrl: 'bukti_transfer_valid.jpg',
            recordedBy: 1
        });
        const newPaymentId = resubmitRes.payment_id;

        const approveRes = await verifyPaymentService({
            paymentId: newPaymentId,
            decision: 'approved',
            actorId: 2
        });
        assert(!approveRes.error, "Approval pembayaran oleh bendahara berhasil");
        assert(approveRes.status === 'approved', "Status pembayaran menjadi 'approved'");

        // Verifikasi status tagihan menjadi paid
        const [paidBill] = await pool.query("SELECT status FROM bills WHERE id = ?;", [targetBill.id]);
        assert(paidBill[0].status === 'paid', "Status tagihan berhasil berubah menjadi 'paid'");

        // Verifikasi pencatatan di ledger
        const [ledgerRows] = await pool.query("SELECT * FROM financial_ledger WHERE source_type = 'ipl' ORDER BY id DESC LIMIT 1;");
        assert(ledgerRows.length > 0 && ledgerRows[0].type === 'in', "Transaksi otomatis tercatat di Buku Kas (financial_ledger) tipe 'in'");

        // Test 6b: Guard Mencegah Pembayaran Ulang untuk Tagihan yang Sudah Paid
        const payPaidBill = await submitPaymentService({
            billId: targetBill.id,
            familyId: targetBill.family_id,
            amountStated: 250000,
            channel: 'transfer',
            proofUrl: 'bukti_iseng.jpg',
            recordedBy: 1
        });
        assert(payPaidBill.error !== undefined, "Tagihan yang sudah 'paid' menolak pembayaran baru");

        // Test 7: Channel Cash to Bendahara (Langsung Approved & Paid)
        console.log("\n8️⃣  Test 7: Pembayaran Tunai Langsung ke Bendahara (Direct Paid)...");
        const [remainingUnpaid] = await pool.query("SELECT * FROM bills WHERE bill_period_id = ? AND status = 'unpaid'", [periodId]);
        assert(remainingUnpaid.length >= 2, "Tersedia tagihan unpaid untuk pengujian lanjutan");
        const secondBill = remainingUnpaid[0];

        const cashRes = await submitPaymentService({
            billId: secondBill.id,
            familyId: secondBill.family_id,
            amountStated: parseFloat(secondBill.amount),
            channel: 'cash_to_bendahara',
            recordedBy: 2
        });
        assert(!cashRes.error, "Pembayaran cash ke bendahara berhasil");
        assert(cashRes.bill_status === 'paid', "Tagihan langsung berubah status menjadi 'paid'");

        // Test 8: Pembebasan Tagihan (Exempt)
        console.log("\n9️⃣  Test 8: Pembebasan Tagihan (Exempt)...");
        const thirdBill = remainingUnpaid[1];
        const exemptRes = await setExemptService(thirdBill.id, "Rumah kosong / tidak berpenghuni", 1);
        assert(!exemptRes.error, "Pembebasan tagihan (exempt) berhasil");
        assert(exemptRes.bill && exemptRes.bill.status === 'exempt', "Status tagihan menjadi 'exempt'");
        assert(exemptRes.bill.exempt_reason === "Rumah kosong / tidak berpenghuni", "Alasan exempt tersimpan");

        // Test 9: Rekapitulasi Summary Periode
        console.log("\n🔟 Test 9: Rekapitulasi Keuangan per Periode...");
        const summaryRes = await getPeriodSummaryService(periodId);
        assert(!summaryRes.error, "Pengambilan rekapitulasi periode berhasil");
        assert(summaryRes.summary.count_paid >= 2, "Jumlah tagihan lunas terhitung akurat (>= 2)");
        assert(summaryRes.summary.count_exempt >= 1, "Jumlah tagihan exempt terhitung akurat (>= 1)");
        assert(summaryRes.summary.total_collected >= 500000, "Total uang terkumpul terhitung akurat (>= 500.000)");

        console.log("\n==========================================");
        console.log(`🎉 HASIL TEST: ${passedTests} PASS, ${failedTests} FAIL`);
        console.log("==========================================");

        if (failedTests === 0) {
            process.exit(0);
        } else {
            process.exit(1);
        }
    } catch (err) {
        console.error("\n💥 FATAL ERROR SAAT MENJALANKAN TEST:", err);
        process.exit(1);
    }
}

runTests();
