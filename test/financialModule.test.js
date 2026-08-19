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
import {
    submitKasContributionService,
    verifyKasContributionService,
    getPendingKasContributionsService,
    getMyKasHistoryService
} from "../services/kasService.js";
import {
    recordManualPaymentService,
    getTrackingService,
    getDashboardStatsService
} from "../services/financialService.js";
import { computeBillStatus } from "../models/billModel.js";

/**
 * Comprehensive Test Suite untuk Rekonsiliasi Modul Keuangan IPL & Kas RT
 */
async function runFinancialTests() {
    console.log("==========================================================");
    console.log("🧪 MEMULAI TEST SUITE: REKONSILIASI KEUANGAN IPL & KAS RT");
    console.log("==========================================================\n");

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
        // 0. Inisialisasi Tabel & Bersihkan Data Uji
        console.log("1️⃣  Inisialisasi Tabel Database & Skema Baru...");
        await initIplBillingTables();

        await pool.query("SET FOREIGN_KEY_CHECKS = 0;");
        await pool.query("DELETE FROM payment_bill_links WHERE id > 0;");
        await pool.query("DELETE FROM payments WHERE id > 0;");
        await pool.query("DELETE FROM bills WHERE id > 0;");
        await pool.query("DELETE FROM bill_periods WHERE id > 0;");
        await pool.query("DELETE FROM kas_contributions WHERE id > 0;");
        await pool.query("DELETE FROM financial_ledger WHERE id > 0;");
        await pool.query("SET FOREIGN_KEY_CHECKS = 1;");

        // Siapkan dummy data keluarga & warga
        const [famRes] = await pool.query("INSERT INTO family (id, no_kk) VALUES (991, 'KK-TEST-991') ON DUPLICATE KEY UPDATE id=id;");
        const testFamilyId = 991;

        const [wargaRes] = await pool.query(`
            INSERT INTO warga (id, nik, nama, family_id, status_data, status_hidup) 
            VALUES (991, 'NIK-TEST-991', 'Budi Santoso Test', ?, 'diterima', 'Hidup')
            ON DUPLICATE KEY UPDATE id=id;
        `, [testFamilyId]);
        const testResidentId = 991;

        // Hubungkan kepala keluarga
        await pool.query("UPDATE family SET kepala_keluarga_id = ? WHERE id = ?", [testResidentId, testFamilyId]);

        // Buat akun dummy
        await pool.query(`
            INSERT INTO acount (id, username, password, role, family_id, resident_id, status)
            VALUES (991, 'warga_test_991', 'hashpass', 'warga', ?, ?, 'active')
            ON DUPLICATE KEY UPDATE id=id;
        `, [testFamilyId, testResidentId]);

        // -------------------------------------------------------------
        // Test 1: Dynamic Overdue Status
        // -------------------------------------------------------------
        console.log("\n2️⃣  Test 1: Kalkulasi Status Overdue Secara Dinamis...");
        const pastBill = { id: 1, status: 'unpaid', due_date: '2020-01-01', amount: 200000 };
        const computedPast = computeBillStatus(pastBill);
        assert(computedPast.is_overdue === true, "Tagihan due_date lampau & unpaid berstatus overdue");
        assert(computedPast.display_status === 'overdue', "display_status bernilai 'overdue'");

        const futureBill = { id: 2, status: 'unpaid', due_date: '2099-12-31', amount: 200000 };
        const computedFuture = computeBillStatus(futureBill);
        assert(computedFuture.is_overdue === false, "Tagihan due_date masa depan tidak overdue");
        assert(computedFuture.display_status === 'unpaid', "display_status tetap 'unpaid'");

        // -------------------------------------------------------------
        // Test 2: Membuat 3 Periode Tagihan & Publish
        // -------------------------------------------------------------
        console.log("\n3️⃣  Test 2: Membuat 3 Periode Tagihan (Jan, Feb, Mar 2026)...");
        const p1 = await createBillPeriodService({
            title: "IPL Januari 2026",
            defaultAmount: 200000,
            dueDate: "2026-01-10",
            periodMonth: 1,
            periodYear: 2026,
            createdBy: 991
        });
        const p2 = await createBillPeriodService({
            title: "IPL Februari 2026",
            defaultAmount: 200000,
            dueDate: "2026-02-10",
            periodMonth: 2,
            periodYear: 2026,
            createdBy: 991
        });
        const p3 = await createBillPeriodService({
            title: "IPL Maret 2026",
            defaultAmount: 200000,
            dueDate: "2026-03-10",
            periodMonth: 3,
            periodYear: 2026,
            createdBy: 991
        });

        assert(!p1.error && !p2.error && !p3.error, "3 periode tagihan draft berhasil dibuat");

        await publishBillPeriodService(p1.period.id, 991);
        await publishBillPeriodService(p2.period.id, 991);
        await publishBillPeriodService(p3.period.id, 991);

        const [userBills] = await pool.query("SELECT * FROM bills WHERE resident_id = ? ORDER BY id ASC;", [testResidentId]);
        assert(userBills.length === 3, "Berhasil menerbitkan 3 tagihan untuk warga uji");
        const billIds = userBills.map(b => b.id);

        // -------------------------------------------------------------
        // Test 3: Validasi Mismatch Nominal Rapel (Tolak sebelum Insert)
        // -------------------------------------------------------------
        console.log("\n4️⃣  Test 3: Validasi Mismatch Nominal Rapel...");
        const mismatchRes = await submitPaymentService({
            billIds: billIds,
            residentId: testResidentId,
            amountStated: 500000, // Seharusnya 600.000 (3 x 200.000)
            channel: 'transfer',
            proofUrl: 'transfer_salah_nominal.jpg',
            recordedBy: 991
        });
        assert(mismatchRes.error !== undefined, "Submit pembayaran rapel dengan nominal tidak cocok ditolak (Error 400 level service)");

        // -------------------------------------------------------------
        // Test 4: Pembayaran Rapel 3 Bulan (Transfer Flow) & Reject
        // -------------------------------------------------------------
        console.log("\n5️⃣  Test 4: Pembayaran Rapel 3 Bulan (Transfer Pending) & Verifikasi Reject...");
        const submitRapelRes = await submitPaymentService({
            billIds: billIds,
            residentId: testResidentId,
            amountStated: 600000, // Sesuai (3 x 200.000)
            channel: 'transfer',
            proofUrl: 'bukti_transfer_rapel_3bulan.jpg',
            recordedBy: 991
        });

        assert(!submitRapelRes.error, "Submit pembayaran rapel 3 bulan berhasil dikirim");
        assert(submitRapelRes.bill_status === 'waiting_verification', "Status tagihan rapel menjadi 'waiting_verification'");
        assert(submitRapelRes.bill_ids.length === 3, "Response mencantumkan 3 bill ID yang terupdate");
        const paymentId = submitRapelRes.payment_id;

        // Cek tabel penghubung payment_bill_links
        const [linkRows] = await pool.query("SELECT * FROM payment_bill_links WHERE payment_id = ?", [paymentId]);
        assert(linkRows.length === 3, "Tercatat 3 baris di payment_bill_links yang menghubungkan payment dengan 3 tagihan");

        // Cek guard mencegah double pending submit
        const doublePendingRes = await submitPaymentService({
            billIds: [billIds[0]],
            residentId: testResidentId,
            amountStated: 200000,
            channel: 'transfer',
            proofUrl: 'bukti_dobel.jpg',
            recordedBy: 991
        });
        assert(doublePendingRes.error !== undefined, "Tagihan yang sedang pending verifikasi ditolak saat disubmit ulang");

        // Reject pembayaran rapel
        const rejectRes = await verifyPaymentService({
            paymentId,
            decision: 'rejected',
            actorId: 991,
            rejectReason: "Nominal di struk transfer terpotong"
        });
        assert(!rejectRes.error, "Verifikasi penolakan (Reject) berhasil diproses");
        assert(rejectRes.status === 'rejected', "Status payment menjadi 'rejected'");

        // Pastikan SEMUA 3 tagihan kembali ke status 'unpaid'
        const [revertedBills] = await pool.query("SELECT status FROM bills WHERE id IN (?, ?, ?)", billIds);
        const allUnpaid = revertedBills.every(b => b.status === 'unpaid');
        assert(allUnpaid, "Semua tagihan yang dirapel otomatis kembali berstatus 'unpaid' setelah ditolak");

        // -------------------------------------------------------------
        // Test 5: Resubmit Rapel & Approval oleh Bendahara (Paid & Ledger)
        // -------------------------------------------------------------
        console.log("\n6️⃣  Test 5: Resubmit Rapel & Approval oleh Bendahara...");
        const resubmitRes = await submitPaymentService({
            billIds: billIds,
            residentId: testResidentId,
            amountStated: 600000,
            channel: 'transfer',
            proofUrl: 'bukti_transfer_rapel_valid.jpg',
            recordedBy: 991
        });
        const newPaymentId = resubmitRes.payment_id;

        const approveRes = await verifyPaymentService({
            paymentId: newPaymentId,
            decision: 'approved',
            actorId: 991
        });
        assert(!approveRes.error, "Approval pembayaran rapel oleh bendahara berhasil");
        assert(approveRes.status === 'approved', "Status payment menjadi 'approved'");

        // Pastikan SEMUA 3 tagihan berubah menjadi 'paid'
        const [paidBills] = await pool.query("SELECT status FROM bills WHERE id IN (?, ?, ?)", billIds);
        const allPaid = paidBills.every(b => b.status === 'paid');
        assert(allPaid, "Semua 3 tagihan yang dirapel berhasil berubah status menjadi 'paid'");

        // Pastikan tercatat 1 entri pemasukan Rp 600.000 di financial_ledger
        const [ledgerRows] = await pool.query("SELECT * FROM financial_ledger WHERE source_type = 'ipl' ORDER BY id DESC LIMIT 1;");
        assert(ledgerRows.length > 0 && Number(ledgerRows[0].amount) === 600000, "Transaksi rapel Rp 600.000 tercatat di Buku Kas (financial_ledger)");

        // -------------------------------------------------------------
        // Test 6: Manual Payment Tunai oleh RT/Bendahara (IPL Rapel)
        // -------------------------------------------------------------
        console.log("\n7️⃣  Test 6: Pencatatan Manual Payment Tunai IPL oleh RT/Bendahara...");
        // Buat 2 periode tagihan baru (April & Mei 2026)
        const p4 = await createBillPeriodService({ title: "IPL April 2026", defaultAmount: 200000, dueDate: "2026-04-10", periodMonth: 4, periodYear: 2026, createdBy: 991 });
        const p5 = await createBillPeriodService({ title: "IPL Mei 2026", defaultAmount: 200000, dueDate: "2026-05-10", periodMonth: 5, periodYear: 2026, createdBy: 991 });
        await publishBillPeriodService(p4.period.id, 991);
        await publishBillPeriodService(p5.period.id, 991);

        const [manualTargetBills] = await pool.query("SELECT id FROM bills WHERE resident_id = ? AND bill_period_id IN (?, ?)", [testResidentId, p4.period.id, p5.period.id]);
        const manualBillIds = manualTargetBills.map(b => b.id);

        const manualIplRes = await recordManualPaymentService({
            familyId: testFamilyId,
            jenisIuran: "ipl",
            amount: 400000,
            billIds: manualBillIds,
            recordedBy: 991
        });
        assert(typeof manualIplRes !== "string" && !manualIplRes.error, "Pencatatan manual payment IPL rapel tunai berhasil");

        const [manualPaidBills] = await pool.query("SELECT status FROM bills WHERE id IN (?, ?)", manualBillIds);
        assert(manualPaidBills.every(b => b.status === 'paid'), "Tagihan manual payment IPL langsung berstatus 'paid'");

        // -------------------------------------------------------------
        // Test 7: Modul Uang Kas RT (Contribute, Verify Approve & Reject)
        // -------------------------------------------------------------
        console.log("\n8️⃣  Test 7: Modul Iuran Kas RT (Contribute, Verify Approve & Reject)...");
        // Submit iuran kas
        const kasContributeRes = await submitKasContributionService({
            residentId: testResidentId,
            amount: 75000,
            category: "sosial",
            description: "Santunan Bencana Warga",
            channel: "transfer",
            proofUrl: "bukti_kas_sosial.jpg",
            recordedBy: 991
        });
        assert(!kasContributeRes.error, "Warga berhasil mengirim iuran kas (Pending)");
        const kasId = kasContributeRes.contribution_id;

        // Approve iuran kas
        const kasApproveRes = await verifyKasContributionService({
            contributionId: kasId,
            decision: "approved",
            actorId: 991
        });
        assert(!kasApproveRes.error, "Bendahara berhasil menyetujui (Approve) iuran kas");

        // Cek ledger kas
        const [kasLedgerRows] = await pool.query("SELECT * FROM financial_ledger WHERE source_type = 'kas' ORDER BY id DESC LIMIT 1;");
        assert(kasLedgerRows.length > 0 && Number(kasLedgerRows[0].amount) === 75000, "Iuran kas otomatis tercatat di financial_ledger");

        // Submit iuran kas kedua untuk di-reject
        const kasSecondRes = await submitKasContributionService({
            residentId: testResidentId,
            amount: 50000,
            category: "kegiatan",
            description: "Iuran 17-an",
            channel: "transfer",
            proofUrl: "bukti_buram.jpg",
            recordedBy: 991
        });
        const kasRejectRes = await verifyKasContributionService({
            contributionId: kasSecondRes.contribution_id,
            decision: "rejected",
            actorId: 991,
            rejectReason: "Bukti transfer tidak terbaca"
        });
        assert(!kasRejectRes.error && kasRejectRes.status === "rejected", "Penolakan iuran kas dengan reject_reason berhasil");

        // Manual kas payment
        const manualKasRes = await recordManualPaymentService({
            familyId: testFamilyId,
            jenisIuran: "kas",
            amount: 100000,
            category: "kematian",
            description: "Santunan Duka Cita Tunai",
            recordedBy: 991
        });
        assert(typeof manualKasRes !== "string" && !manualKasRes.error, "Pencatatan manual payment kas tunai berhasil");

        // -------------------------------------------------------------
        // Test 8: Pelacakan Tunggakan (Tracking) dari Sumber Baru (bills)
        // -------------------------------------------------------------
        console.log("\n9️⃣  Test 8: Dashboard Pelacakan Tunggakan (Tracking) dari Sumber bills...");
        const trackingList = await getTrackingService(1, 2026);
        assert(Array.isArray(trackingList) && trackingList.length > 0, "Daftar pelacakan tunggakan berhasil ditarik dari bills");
        const myFamilyTracking = trackingList.find(t => t.family_id === testFamilyId);
        assert(myFamilyTracking && (myFamilyTracking.bill_status === 'paid' || myFamilyTracking.payment_status === 'approved'), "Status pelacakan tagihan bulan 1/2026 terpetakan 'paid' / 'approved'");

        // -------------------------------------------------------------
        // Test 9: Rekap Dashboard Stats & Saldo Berjalan
        // -------------------------------------------------------------
        console.log("\n🔟 Test 9: Statistik Dashboard Keuangan Kas RT...");
        const dashboardStats = await getDashboardStatsService();
        assert(dashboardStats.total_income >= 1175000, "Total pemasukan ledger terhitung akurat (>= Rp 1.175.000)");

        console.log("\n==========================================================");
        console.log(`🎉 HASIL PENGUJIAN LENGKAP: ${passedTests} PASS, ${failedTests} FAIL`);
        console.log("==========================================================");

        if (failedTests === 0) {
            return true;
        } else {
            return false;
        }
    } catch (err) {
        console.error("\n💥 FATAL ERROR SAAT MENJALANKAN TEST:", err);
        return false;
    }
}

// Eksekusi jika dipanggil langsung
if (process.argv[1] && (process.argv[1].endsWith("financialModule.test.js") || process.argv[1].includes("financialModule"))) {
    runFinancialTests().then(success => {
        process.exit(success ? 0 : 1);
    }).catch(() => {
        process.exit(1);
    });
}
