import pool from "../config/sqlconfig.js";
import { initIplBillingTables } from "../utils/migrateIplBills.js";
import { ensureNotificationTable } from "../models/notificationModel.js";
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
import {
    createNotification,
    getMyNotificationsService,
    getUnreadNotificationCountService,
    markNotificationReadService,
    markAllNotificationsReadService
} from "../services/notificationService.js";
import { changePengaduanStatus, createPengaduan } from "../services/pengaduan.js";
import { changePengajuanStatus, createPengajuan } from "../services/pengajuan.js";
import { computeBillStatus } from "../models/billModel.js";

/**
 * Comprehensive Test Suite: Keuangan IPL & Kas RT + Fitur Notifikasi In-App Generic
 */
export async function runFinancialTests() {
    console.log("===================================================================");
    console.log("🧪 TEST SUITE: MODUL KEUANGAN IPL, KAS RT & NOTIFIKASI IN-APP");
    console.log("===================================================================\n");

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
        console.log("1️⃣  Inisialisasi Tabel Database (IPL, Kas, Notifications)...");
        await initIplBillingTables();
        await ensureNotificationTable();

        await pool.query("SET FOREIGN_KEY_CHECKS = 0;");
        await pool.query("DELETE FROM notifications WHERE id > 0;");
        await pool.query("DELETE FROM payment_bill_links WHERE id > 0;");
        await pool.query("DELETE FROM payments WHERE id > 0;");
        await pool.query("DELETE FROM bills WHERE id > 0;");
        await pool.query("DELETE FROM bill_periods WHERE id > 0;");
        await pool.query("DELETE FROM kas_contributions WHERE id > 0;");
        await pool.query("DELETE FROM report WHERE id > 0;");
        await pool.query("DELETE FROM letter WHERE id > 0;");
        await pool.query("DELETE FROM financial_ledger WHERE id > 0;");
        await pool.query("DELETE FROM acount WHERE id IN (991, 992);");
        await pool.query("DELETE FROM warga WHERE family_id IN (991, 992);");
        await pool.query("DELETE FROM family WHERE id IN (991, 992);");
        await pool.query("SET FOREIGN_KEY_CHECKS = 1;");

        // -------------------------------------------------------------
        // Siapkan Data Dummy 2 Keluarga:
        // - Keluarga A (ID 991): Memiliki 5 Anggota Keluarga
        // - Keluarga B (ID 992): Memiliki 3 Anggota Keluarga
        // -------------------------------------------------------------
        console.log("🏠 Menyiapkan Fixture: Keluarga A (5 Warga) & Keluarga B (3 Warga)...");
        await pool.query("INSERT INTO family (id, no_kk) VALUES (991, 'KK-KELUARGA-A-001') ON DUPLICATE KEY UPDATE id=id;");
        await pool.query("INSERT INTO family (id, no_kk) VALUES (992, 'KK-KELUARGA-B-002') ON DUPLICATE KEY UPDATE id=id;");

        // 5 Warga di Keluarga A
        await pool.query(`
            INSERT INTO warga (id, nik, nama, family_id, status_data, status_hidup) VALUES
            (9101, 'NIK-A-01', 'Budi Santoso (Kepala KK A)', 991, 'diterima', 'Hidup'),
            (9102, 'NIK-A-02', 'Siti Rahma (Istri A)', 991, 'diterima', 'Hidup'),
            (9103, 'NIK-A-03', 'Andi Pratama (Anak 1 A)', 991, 'diterima', 'Hidup'),
            (9104, 'NIK-A-04', 'Rina Wati (Anak 2 A)', 991, 'diterima', 'Hidup'),
            (9105, 'NIK-A-05', 'Doni Saputra (Anak 3 A)', 991, 'diterima', 'Hidup')
            ON DUPLICATE KEY UPDATE id=id;
        `);
        await pool.query("UPDATE family SET kepala_keluarga_id = 9101 WHERE id = 991;");

        // 3 Warga di Keluarga B
        await pool.query(`
            INSERT INTO warga (id, nik, nama, family_id, status_data, status_hidup) VALUES
            (9201, 'NIK-B-01', 'Joko Widodo (Kepala KK B)', 992, 'diterima', 'Hidup'),
            (9202, 'NIK-B-02', 'Sri Mulyani (Istri B)', 992, 'diterima', 'Hidup'),
            (9203, 'NIK-B-03', 'Bagus Nugroho (Anak B)', 992, 'diterima', 'Hidup')
            ON DUPLICATE KEY UPDATE id=id;
        `);
        await pool.query("UPDATE family SET kepala_keluarga_id = 9201 WHERE id = 992;");

        // Akun Warga untuk Keluarga A & B
        await pool.query(`
            INSERT INTO acount (id, username, password, role, family_id, resident_id, status) VALUES
            (991, 'akun_keluarga_a', 'hashpass', 'warga', 991, 9101, 'active'),
            (992, 'akun_keluarga_b', 'hashpass', 'warga', 992, 9201, 'active')
            ON DUPLICATE KEY UPDATE id=id;
        `);

        // -------------------------------------------------------------
        // Test 1: Publish Bill Period untuk Keluarga Multi-Anggota & Notifikasi
        // -------------------------------------------------------------
        console.log("\n2️⃣  Test 1: Publish Periode Tagihan — 1 Bill per KK & Trigger Notifikasi...");
        const p1 = await createBillPeriodService({
            title: "IPL Januari 2026",
            defaultAmount: 200000,
            dueDate: "2026-01-10",
            periodMonth: 1,
            periodYear: 2026,
            createdBy: 991
        });
        assert(!p1.error, "Periode tagihan draft 'IPL Januari 2026' berhasil dibuat");

        const publishRes = await publishBillPeriodService(p1.period.id, 991);
        assert(!publishRes.error, "Publish periode tagihan berhasil");

        // Cek total bills yang ter-generate
        const [generatedBills] = await pool.query("SELECT * FROM bills WHERE bill_period_id = ? AND family_id IN (991, 992)", [p1.period.id]);
        assert(generatedBills.length === 2, `Hanya ter-generate ${generatedBills.length} tagihan untuk 2 KK (Bukan 8 tagihan per warga individu!)`);

        // Cek notifikasi publish terkirim ke Akun Keluarga A
        const notifsFamA = await getMyNotificationsService(991);
        const billNotifA = notifsFamA.notifications.find(n => n.type === 'ipl' && n.reference_id === p1.period.id);
        assert(billNotifA !== undefined, "Akun Keluarga A menerima notifikasi in-app 'Tagihan IPL Baru'");

        // -------------------------------------------------------------
        // Test 2: Database Constraint UNIQUE(bill_period_id, family_id)
        // -------------------------------------------------------------
        console.log("\n3️⃣  Test 2: Uji Database Constraint UNIQUE(bill_period_id, family_id)...");
        let duplicateErrorCaught = false;
        try {
            await pool.query(
                "INSERT INTO bills (bill_period_id, family_id, amount, due_date, status) VALUES (?, 991, 200000, '2026-01-10', 'unpaid')",
                [p1.period.id]
            );
        } catch (dbErr) {
            duplicateErrorCaught = true;
        }
        assert(duplicateErrorCaught, "Database menolak insert duplikat tagihan untuk KK yang sama di periode yang sama");

        // -------------------------------------------------------------
        // Test 3: ⭐ PRIORITAS UTAMA: Reject Pembayaran IPL Mengirim Notifikasi Penolakan
        // -------------------------------------------------------------
        console.log("\n4️⃣  Test 3: ⭐ REJECT Pembayaran IPL — Notifikasi Penolakan dengan rejectReason...");
        const [familyABills] = await pool.query("SELECT * FROM bills WHERE bill_period_id = ? AND family_id = 991", [p1.period.id]);
        const testBillAId = familyABills[0].id;

        // Submit pembayaran transfer
        const submitRejectTest = await submitPaymentService({
            billIds: [testBillAId],
            familyId: 991,
            amountStated: 200000,
            channel: 'transfer',
            proofUrl: 'bukti_buram.jpg',
            recordedBy: 991
        });
        assert(!submitRejectTest.error, "Submit pembayaran untuk tes reject berhasil");

        const rejectPaymentId = submitRejectTest.payment_id;
        const rejectReasonText = "Foto bukti transfer buram dan nominal tidak terbaca jelas";

        // Bendahara menolak pembayaran
        const rejectResult = await verifyPaymentService({
            paymentId: rejectPaymentId,
            decision: "rejected",
            actorId: 991,
            rejectReason: rejectReasonText
        });
        assert(!rejectResult.error && rejectResult.status === "rejected", "Verifikasi penolakan (Reject) berhasil");

        // Periksa notifikasi penolakan masuk ke akun Keluarga A
        const notifAfterReject = await getMyNotificationsService(991);
        const rejectNotif = notifAfterReject.notifications.find(n => n.type === 'ipl' && n.title === 'Pembayaran IPL Ditolak' && n.reference_id === rejectPaymentId);
        assert(rejectNotif !== undefined, "Notifikasi 'Pembayaran IPL Ditolak' berhasil masuk ke akun warga");
        assert(rejectNotif?.message.includes(rejectReasonText), "Notifikasi penolakan memuat alasan penolakan (rejectReason) dengan lengkap");

        // -------------------------------------------------------------
        // Test 4: Approve Pembayaran Rapel IPL Mengirim Notifikasi Persetujuan
        // -------------------------------------------------------------
        console.log("\n5️⃣  Test 4: APPROVE Pembayaran Rapel IPL — Notifikasi Lunas Masuk...");
        const p2 = await createBillPeriodService({ title: "IPL Februari 2026", defaultAmount: 200000, dueDate: "2026-02-10", periodMonth: 2, periodYear: 2026, createdBy: 991 });
        const p3 = await createBillPeriodService({ title: "IPL Maret 2026", defaultAmount: 200000, dueDate: "2026-03-10", periodMonth: 3, periodYear: 2026, createdBy: 991 });
        await publishBillPeriodService(p2.period.id, 991);
        await publishBillPeriodService(p3.period.id, 991);

        const [allFamilyABills] = await pool.query("SELECT * FROM bills WHERE family_id = 991 AND status = 'unpaid' ORDER BY id ASC;");
        const rapelBillIds = allFamilyABills.map(b => b.id);

        const rapelSubmitRes = await submitPaymentService({
            billIds: rapelBillIds,
            familyId: 991,
            amountStated: 600000,
            channel: 'transfer',
            proofUrl: 'bukti_rapel_sah.jpg',
            recordedBy: 991
        });
        assert(!rapelSubmitRes.error, "Submit rapel 3 bulan berhasil");

        const approveRes = await verifyPaymentService({
            paymentId: rapelSubmitRes.payment_id,
            decision: "approved",
            actorId: 991
        });
        assert(!approveRes.error && approveRes.status === "approved", "Verifikasi approve rapel berhasil");

        const notifAfterApprove = await getMyNotificationsService(991);
        const approveNotif = notifAfterApprove.notifications.find(n => n.type === 'ipl' && n.title.includes('Disetujui') && n.reference_id === rapelSubmitRes.payment_id);
        assert(approveNotif !== undefined, "Notifikasi 'Pembayaran IPL Disetujui (Lunas)' masuk ke akun warga");

        // -------------------------------------------------------------
        // Test 5: Notifikasi Iuran Kas RT (Approve & Reject)
        // -------------------------------------------------------------
        console.log("\n6️⃣  Test 5: Notifikasi Iuran Kas RT (Approve & Reject)...");
        const kasRes1 = await submitKasContributionService({
            familyId: 991,
            amount: 100000,
            category: "kegiatan",
            description: "Iuran 17 Agustusan",
            channel: "transfer",
            proofUrl: "kas_17an.jpg",
            recordedBy: 991
        });
        await verifyKasContributionService({ contributionId: kasRes1.contribution_id, decision: "approved", actorId: 991 });

        const kasNotifApprove = (await getMyNotificationsService(991)).notifications.find(n => n.type === 'kas' && n.reference_id === kasRes1.contribution_id);
        assert(kasNotifApprove !== undefined && kasNotifApprove.title.includes("Disetujui"), "Notifikasi Iuran Kas Disetujui masuk");

        const kasRes2 = await submitKasContributionService({
            familyId: 991,
            amount: 50000,
            category: "sosial",
            description: "Kas Santunan",
            channel: "transfer",
            proofUrl: "salah_transfer.jpg",
            recordedBy: 991
        });
        await verifyKasContributionService({ contributionId: kasRes2.contribution_id, decision: "rejected", actorId: 991, rejectReason: "Nominal tidak sesuai rekening koran" });

        const kasNotifReject = (await getMyNotificationsService(991)).notifications.find(n => n.type === 'kas' && n.reference_id === kasRes2.contribution_id);
        assert(kasNotifReject !== undefined && kasNotifReject.title.includes("Ditolak"), "Notifikasi Iuran Kas Ditolak masuk");
        assert(kasNotifReject?.message.includes("Nominal tidak sesuai"), "Notifikasi penolakan kas memuat rejectReason");

        // -------------------------------------------------------------
        // Test 6: Notifikasi Pengaduan & Pengajuan Surat
        // -------------------------------------------------------------
        console.log("\n7️⃣  Test 6: Notifikasi Pengaduan Warga & Pengajuan Surat...");
        // 1. Pengaduan
        const addPengaduanRes = await createPengaduan(991, "Lampu jalan depan rumah padam sudah 3 hari", "fasilitas");
        const pengaduanId = addPengaduanRes.insertId;
        await changePengaduanStatus(pengaduanId, "Proses", "Teknisi dijadwalkan besok pagi");

        const notifPengaduan = (await getMyNotificationsService(991)).notifications.find(n => n.type === 'pengaduan' && n.reference_id === pengaduanId);
        assert(notifPengaduan !== undefined, "Notifikasi perubahan status pengaduan ('Proses') masuk ke akun warga");
        assert(notifPengaduan?.message.includes("Teknisi dijadwalkan"), "Notifikasi pengaduan memuat catatan tindak lanjut");

        // 2. Pengajuan Surat
        const addSuratRes = await createPengajuan(991, "Pengantar Pembuatan KTP Baru", "Surat Pengantar KTP");
        const suratId = addSuratRes.insertId;
        await changePengajuanStatus(suratId, "disetujui");

        const notifSurat = (await getMyNotificationsService(991)).notifications.find(n => n.type === 'surat' && n.reference_id === suratId);
        assert(notifSurat !== undefined && notifSurat.title.includes("Disetujui"), "Notifikasi status surat disetujui masuk ke akun warga");

        // -------------------------------------------------------------
        // Test 7: API Endpoint Helpers (Unread Count, Mark Single Read, Mark All Read)
        // -------------------------------------------------------------
        console.log("\n8️⃣  Test 7: Pengujian Unread Count & Mark Read API...");
        const unreadBefore = await getUnreadNotificationCountService(991);
        assert(unreadBefore.unread_count > 0, `Unread count terdeteksi: ${unreadBefore.unread_count} notifikasi`);

        // Mark 1 notifikasi as read
        const firstUnread = (await getMyNotificationsService(991, { is_read: false })).notifications[0];
        const markOneRes = await markNotificationReadService(firstUnread.id, 991);
        assert(markOneRes.is_read === true, "Tandai 1 notifikasi sebagai read berhasil");

        const unreadAfterOne = await getUnreadNotificationCountService(991);
        assert(unreadAfterOne.unread_count === unreadBefore.unread_count - 1, "Unread count berkurang 1");

        // Mark all as read
        const markAllRes = await markAllNotificationsReadService(991);
        assert(markAllRes.unread_count === 0, "Tandai seluruh notifikasi read berhasil");

        const unreadFinal = await getUnreadNotificationCountService(991);
        assert(unreadFinal.unread_count === 0, "Unread count akun kini 0");

        console.log("\n===================================================================");
        console.log(`🎉 HASIL PENGUJIAN SEMUA CHECKPOINT: ${passedTests} PASS, ${failedTests} FAIL`);
        console.log("===================================================================");

        return failedTests === 0;
    } catch (err) {
        console.error("\n💥 FATAL ERROR SAAT TEST:", err);
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
