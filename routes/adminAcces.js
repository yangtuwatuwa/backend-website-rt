import e from "express";
import { warga, inputData, getResident, editedResident, inputHouse, getHouse, getWarga, revealWarga, revealFamily, searchResidentController, getPopulationStatsController, deleteWargaController } from "../controllers/residentController.js"
import { createWargaAccountController, createStaffAccountController, bindAccountToFamilyController, checkAccountStatusController, getAccessLogsController } from "../controllers/accountController.js"
import { getPendingWargaController, verifyWargaController } from "../controllers/verificationController.js"
import { reviewPengaduan, approvePengaduan, removePengaduanController } from "../controllers/pengaduan.js"
import { reviewPengajuan, approvePengajuan, archivePengajuanController } from "../controllers/pengajuan.js"
import { 
    getPendingPaymentsController, 
    approveIplPaymentController, 
    approveKasPaymentController, 
    recordExpenseController, 
    recordIncomeController,
    recordManualPaymentController,
    updateFinancialSettingsController, 
    getFinancialSettingsController,
    getArrearsTrackingController,
    getFinancialSummaryController,
    generateBatchBillsController
} from "../controllers/financeController.js"
import { verifyInput, residentSchema, updateResidentSchema, announcementSchema, updateAnnouncementSchema } from "../middlewares/verivyGmail.js"
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
import { registerFamilyController } from "../controllers/familyRegistrationController.js"
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


app.post("/resident", verifyInput(residentSchema), checkRoles('rt', 'sekretaris'), inputData)
app.post("/house", checkRoles('rt', 'sekretaris'), inputHouse )
app.post("/datawarga", checkRoles('rt', 'sekretaris'), warga)
app.delete("/datawarga/:id", checkRoles('rt', 'sekretaris'), deleteWargaController)
app.patch("/resident/:id", verifyInput(updateResidentSchema), checkRoles('rt', 'sekretaris'), editedResident)


// Route Keuangan Bendahara & RT
app.get("/finance/pending", checkRoles('rt', 'bendahara'), getPendingPaymentsController)
app.patch("/finance/approve-ipl/:id", checkRoles('rt', 'bendahara'), approveIplPaymentController)
app.patch("/finance/approve-kas/:id", checkRoles('rt', 'bendahara'), approveKasPaymentController)
app.post("/finance/expense", checkRoles('rt', 'bendahara'), uploadSensitifMiddleware, recordExpenseController)
app.post("/finance/income", checkRoles('rt', 'bendahara'), recordIncomeController)
app.post("/finance/manual-payment", checkRoles('rt', 'bendahara'), recordManualPaymentController)
app.post("/finance/generate-bills", checkRoles('rt', 'bendahara'), generateBatchBillsController)
app.patch("/finance/settings", checkRoles('rt', 'bendahara'), updateFinancialSettingsController)
app.get("/finance/settings", checkRoles('rt', 'bendahara'), getFinancialSettingsController)
app.get("/finance/tracking", checkRoles('rt', 'bendahara'), getArrearsTrackingController)
app.get("/finance/summary", checkRoles('rt', 'bendahara'), getFinancialSummaryController)


// Route Kelola Petugas Voting (Karyawan)
app.post("/karyawan", checkRoles('rt', 'sekretaris'), uploadSensitifMiddleware, createKaryawanController)
app.delete("/karyawan/:id", checkRoles('rt', 'sekretaris'), removeKaryawanController)

// Route Audit Log & Dokumen Kependudukan
app.get("/access-logs", checkRoles('rt', 'sekretaris'), getAccessLogsController)
app.delete("/resident/sensitifdata/:id", checkRoles('rt', 'sekretaris'), deleteSensitifDataController)

export default app