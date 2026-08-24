import e from "express";
import { warga, getResident, editedResident, getHouse, getWarga, revealWarga, revealFamily, searchResidentController, getPopulationStatsController, deleteWargaController, editNikWargaController, editNoKkController, getKepalaKeluargaController } from "../controllers/residentController.js"
import { createWargaAccountController, createStaffAccountController, bindAccountToFamilyController, checkAccountStatusController, getAccessLogsController } from "../controllers/accountController.js"
import { getPendingWargaController, verifyWargaController } from "../controllers/verificationController.js"
import { reviewPengaduan, approvePengaduan, removePengaduanController } from "../controllers/pengaduan.js"
import { reviewPengajuan, approvePengajuan, archivePengajuanController } from "../controllers/pengajuan.js"
import { 
    getPendingPaymentsController, 
    recordExpenseController, 
    recordIncomeController,
    recordManualPaymentController,
    updateFinancialSettingsController, 
    getFinancialSettingsController,
    getArrearsTrackingController,
    getFinancialSummaryController,
    getDashboardStatsController,
    getPaymentProofFileController
} from "../controllers/financeController.js"
import {
    verifyKasContributionController,
    getPendingKasContributionsController,
    getKasAuditController
} from "../controllers/kasController.js"
import { verifyInput, updateResidentSchema, announcementSchema, updateAnnouncementSchema } from "../middlewares/verivyGmail.js"
import { createAnnouncementController, getAnnouncementsController, editAnnouncementController, removeAnnouncementController } from "../controllers/announcement.js"
import { createAgendaController, getAgendasController, editAgendaController, removeAgendaController } from "../controllers/agenda.js"
import { createSuratMasukController, getSuratMasukController, createSuratKeluarController, getSuratKeluarController } from "../controllers/suratController.js"
import { 
    uploadTemplateSuratController, 
    getTemplateSuratListController, 
    downloadTemplateSuratController, 
    updateTemplateSuratController, 
    deleteTemplateSuratController 
} from "../controllers/templateSuratController.js"
import { uploadTemplateMiddleware, uploadSensitifMiddleware } from "../middlewares/multerConfig.js"
import { createKaryawanController, removeKaryawanController } from "../controllers/karyawan.js"
import { deleteSensitifDataController } from "../controllers/documentController.js"
import { registerFamilyController, registerResidentOnlyController } from "../controllers/familyRegistrationController.js"
import jwtAuth from "../middlewares/validationJwt.js"
import { checkRoles } from "../middlewares/checkRole.js"
import { authLimiter } from "../middlewares/rateLimiter.js"

const app = e()


app.use(jwtAuth);
app.get("/population-stats", checkRoles('rt', 'sekretaris', 'bendahara'), getPopulationStatsController)
app.get("/stats-warga", checkRoles('rt', 'sekretaris', 'bendahara'), getPopulationStatsController)
app.get("/resident", checkRoles('rt', "sekretaris"), getResident)
app.get("/resident/search", checkRoles('rt', 'sekretaris'), searchResidentController)
app.get("/house", checkRoles('rt'), getHouse)
app.get("/datawarga", checkRoles('rt', 'sekretaris'), getWarga)
app.get("/kepala-keluarga", checkRoles('rt', 'sekretaris', 'bendahara'), getKepalaKeluargaController)
app.get("/kepala-keluarga/list", checkRoles('rt', 'sekretaris', 'bendahara'), getKepalaKeluargaController)
app.get("/family/heads", checkRoles('rt', 'sekretaris', 'bendahara'), getKepalaKeluargaController)
app.get("/resident/heads", checkRoles('rt', 'sekretaris', 'bendahara'), getKepalaKeluargaController)

import { updateAccountByAdminController } from "../controllers/accountProfileController.js"

app.post("/reveal-warga/:id", authLimiter, checkRoles('rt'), revealWarga)
app.post("/reveal-resident/:id", authLimiter, checkRoles('rt'), revealFamily)
app.post("/create-account", checkRoles('rt'), createWargaAccountController)
app.get("/check-account/:familyId", checkRoles('rt', 'sekretaris'), checkAccountStatusController)
app.get("/account-status/:familyId", checkRoles('rt', 'sekretaris'), checkAccountStatusController)
app.post("/create-staff-account", checkRoles('rt'), createStaffAccountController)
app.patch("/account/bind-family", checkRoles('rt', 'sekretaris'), bindAccountToFamilyController)
app.patch("/account/:id", checkRoles('rt', 'sekretaris'), updateAccountByAdminController)
app.patch("/account/family/:familyId", checkRoles('rt', 'sekretaris'), updateAccountByAdminController)
app.patch("/account-warga/:familyId", checkRoles('rt', 'sekretaris'), updateAccountByAdminController)
app.patch("/account-update", checkRoles('rt', 'sekretaris'), updateAccountByAdminController)
app.post("/register-family", checkRoles('rt', 'sekretaris'), registerFamilyController)
app.post("/register-resident-only", checkRoles('rt', 'sekretaris'), registerResidentOnlyController)


app.get("/pengaduan", checkRoles('rt', 'sekretaris'), reviewPengaduan)
app.patch("/pengaduan/:id", checkRoles('rt', 'sekretaris'), approvePengaduan)
app.delete("/pengaduan/:id", checkRoles('rt', 'sekretaris'), removePengaduanController)

app.get("/pengajuan", checkRoles('rt', 'sekretaris'), reviewPengajuan)
app.patch("/pengajuan/:id", checkRoles('rt', 'sekretaris'), approvePengajuan)
app.patch("/pengajuan/:id/archive", checkRoles('rt', 'sekretaris'), archivePengajuanController)

import { downloadSensitifFileController, getWargaKtpController } from "../controllers/documentController.js"

// Route Verifikasi Pendaftaran Warga Mandiri
app.get("/pending-warga", checkRoles('rt', 'sekretaris'), getPendingWargaController)
app.get("/warga/pending", checkRoles('rt', 'sekretaris'), getPendingWargaController)
app.get("/verification/warga", checkRoles('rt', 'sekretaris'), getPendingWargaController)

app.patch("/pending-warga/:id", checkRoles('rt', 'sekretaris'), verifyWargaController)
app.patch("/verify-warga/:id", checkRoles('rt', 'sekretaris'), verifyWargaController)
app.patch("/warga/verify/:id", checkRoles('rt', 'sekretaris'), verifyWargaController)
app.patch("/warga/status/:id", checkRoles('rt', 'sekretaris'), verifyWargaController)

// Route Akses Aman Foto KTP & Berkas Sensitif
app.get("/sensitifdata/file/:document_id", checkRoles('rt', 'sekretaris', 'bendahara'), downloadSensitifFileController)
app.get("/warga/ktp/:id", checkRoles('rt', 'sekretaris', 'bendahara'), getWargaKtpController)
app.get("/warga/:id/ktp", checkRoles('rt', 'sekretaris', 'bendahara'), getWargaKtpController)


app.post("/announcement", verifyInput(announcementSchema), checkRoles('rt', 'sekretaris'), createAnnouncementController)
app.get("/announcement", checkRoles('rt', 'sekretaris'), getAnnouncementsController)
app.patch("/announcement/:id", verifyInput(updateAnnouncementSchema), checkRoles('rt', 'sekretaris'), editAnnouncementController)
app.delete("/announcement/:id", checkRoles('rt', 'sekretaris'), removeAnnouncementController)

// Route Agenda Kegiatan RT (CRUD)
app.post("/agenda", checkRoles('rt', 'sekretaris'), createAgendaController)
app.get("/agenda", checkRoles('rt', 'sekretaris'), getAgendasController)
app.patch("/agenda/:id", checkRoles('rt', 'sekretaris'), editAgendaController)
app.delete("/agenda/:id", checkRoles('rt', 'sekretaris'), removeAgendaController)

// Route Surat Masuk & Surat Keluar RT
app.post("/surat-masuk", checkRoles('rt', 'sekretaris'), createSuratMasukController)
app.get("/surat-masuk", checkRoles('rt', 'sekretaris'), getSuratMasukController)
app.post("/surat-keluar", checkRoles('rt', 'sekretaris'), createSuratKeluarController)
app.get("/surat-keluar", checkRoles('rt', 'sekretaris'), getSuratKeluarController)

// Route Template Surat RT & Sekretaris (Upload, List, Download, Edit, Delete)
app.post("/template-surat", checkRoles('rt', 'sekretaris'), uploadTemplateMiddleware, uploadTemplateSuratController)
app.get("/template-surat", checkRoles('rt', 'sekretaris'), getTemplateSuratListController)
app.get("/template-surat/download/:id", checkRoles('rt', 'sekretaris'), downloadTemplateSuratController)
app.patch("/template-surat/:id", checkRoles('rt', 'sekretaris'), uploadTemplateMiddleware, updateTemplateSuratController)
app.delete("/template-surat/:id", checkRoles('rt', 'sekretaris'), deleteTemplateSuratController)


app.post("/datawarga", checkRoles('rt', 'sekretaris'), warga)
app.delete("/datawarga/:id", checkRoles('rt', 'sekretaris'), deleteWargaController)

app.patch("/resident/:id", verifyInput(updateResidentSchema), checkRoles('rt', 'sekretaris'), editedResident)
app.patch("/datawarga/nik/:id", checkRoles('rt', 'sekretaris'), editNikWargaController)
app.patch("/resident/nokk/:id", checkRoles('rt', 'sekretaris'), editNoKkController)


import {
    createBillPeriodController,
    getAllBillPeriodsController,
    getBillPeriodDetailController,
    publishBillPeriodController,
    getPeriodSummaryController,
    getPeriodBillsController,
    setExemptController,
    getPendingPaymentsController as getPendingIplBillPaymentsController,
    verifyPaymentController as verifyIplBillPaymentController,
    getPaymentAuditController
} from "../controllers/iplBillingController.js"

// Route Keuangan Umum Bendahara & RT
app.get("/finance/pending", checkRoles('rt', 'bendahara', 'superadmin', 'admin'), getPendingPaymentsController)
app.post("/finance/expense", checkRoles('rt', 'bendahara', 'superadmin', 'admin'), uploadSensitifMiddleware, recordExpenseController)
app.post("/finance/income", checkRoles('rt', 'bendahara', 'superadmin', 'admin'), recordIncomeController)
app.post("/finance/manual-payment", checkRoles('rt', 'bendahara', 'superadmin', 'admin'), recordManualPaymentController)
app.patch("/finance/settings", checkRoles('rt', 'bendahara', 'superadmin', 'admin'), updateFinancialSettingsController)
app.get("/finance/settings", checkRoles('rt', 'bendahara', 'superadmin', 'admin'), getFinancialSettingsController)
app.get("/finance/tracking", checkRoles('rt', 'bendahara', 'superadmin', 'admin'), getArrearsTrackingController)
app.get("/finance/summary", checkRoles('rt', 'bendahara', 'superadmin', 'admin'), getFinancialSummaryController)
app.get("/finance/stats", checkRoles('rt', 'bendahara', 'superadmin', 'admin'), getDashboardStatsController)
app.get("/finance/ledger", checkRoles('rt', 'bendahara', 'superadmin', 'admin'), getDashboardStatsController)
app.get("/finance/transactions", checkRoles('rt', 'bendahara', 'superadmin', 'admin'), getDashboardStatsController)

// Route Modul Penagihan IPL (Bill Periods, Snapshot Bills, Verifikasi & Rekap)
app.post("/finance/bill-periods", checkRoles('bendahara', 'superadmin', 'admin'), createBillPeriodController)
app.get("/finance/bill-periods", checkRoles('bendahara', 'rt', 'sekretaris', 'superadmin', 'admin'), getAllBillPeriodsController)
app.get("/finance/bill-periods/:id", checkRoles('bendahara', 'rt', 'sekretaris', 'superadmin', 'admin'), getBillPeriodDetailController)
app.post("/finance/bill-periods/:id/publish", checkRoles('bendahara', 'superadmin', 'admin'), publishBillPeriodController)
app.get("/finance/bill-periods/:id/summary", checkRoles('bendahara', 'rt', 'sekretaris', 'superadmin', 'admin'), getPeriodSummaryController)
app.get("/finance/bill-periods/:id/bills", checkRoles('bendahara', 'rt', 'sekretaris', 'superadmin', 'admin'), getPeriodBillsController)
app.patch("/finance/bills/:id/exempt", checkRoles('rt', 'bendahara', 'superadmin', 'admin'), setExemptController)
app.get("/finance/ipl-payments/pending", checkRoles('bendahara', 'rt', 'superadmin', 'admin'), getPendingIplBillPaymentsController)
app.patch("/finance/ipl-payments/:id/verify", checkRoles('bendahara', 'superadmin', 'admin'), verifyIplBillPaymentController)
app.get("/finance/ipl-payments/audit", checkRoles('rt', 'bendahara', 'sekretaris', 'superadmin', 'admin'), getPaymentAuditController)

// Route Modul Iuran Kas RT (Verifikasi & Audit)
app.get("/finance/kas-contributions/pending", checkRoles('bendahara', 'rt', 'superadmin', 'admin'), getPendingKasContributionsController)
app.patch("/finance/kas-contributions/:id/verify", checkRoles('bendahara', 'superadmin', 'admin'), verifyKasContributionController)
app.get("/finance/kas-contributions/audit", checkRoles('rt', 'bendahara', 'sekretaris', 'superadmin', 'admin'), getKasAuditController)

// Route Download / Tampilkan Bukti Transfer Pembayaran (IPL & Kas)
app.get("/finance/proof/:filename", checkRoles('rt', 'bendahara', 'sekretaris', 'superadmin', 'admin'), getPaymentProofFileController)


// Route Kelola Petugas Voting (Karyawan)
app.post("/karyawan", checkRoles('rt', 'sekretaris'), uploadSensitifMiddleware, createKaryawanController)
app.delete("/karyawan/:id", checkRoles('rt', 'sekretaris'), removeKaryawanController)

// Route Audit Log & Dokumen Kependudukan
app.get("/access-logs", checkRoles('rt', 'sekretaris'), getAccessLogsController)
app.delete("/resident/sensitifdata/:id", checkRoles('rt', 'sekretaris'), deleteSensitifDataController)

export default app
