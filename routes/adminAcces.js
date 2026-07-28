import e from "express";
import { warga, inputData, getResident, editedResident, inputHouse, getHouse, getWarga, revealWarga, revealFamily, searchResidentController } from "../controllers/residentController.js"
import { createWargaAccountController, createStaffAccountController, bindAccountToFamilyController } from "../controllers/accountController.js"
import { getPendingWargaController, verifyWargaController } from "../controllers/verificationController.js"
import { reviewPengaduan, approvePengaduan } from "../controllers/pengaduan.js"
import { reviewPengajuan, approvePengajuan } from "../controllers/pengajuan.js"
import { 
    getPendingPaymentsController, 
    approveIplPaymentController, 
    approveKasPaymentController, 
    recordExpenseController, 
    recordIncomeController,
    recordManualPaymentController,
    updateFinancialSettingsController, 
    getFinancialSettingsController,
    getArrearsTrackingController 
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
import { uploadTemplateMiddleware } from "../middlewares/multerConfig.js"
import { registerFamilyController } from "../controllers/familyRegistrationController.js"
import jwtAuth from "../middlewares/validationJwt.js"
import { checkRoles } from "../middlewares/checkRole.js"
import { authLimiter } from "../middlewares/rateLimiter.js"

const app = e()


app.use(jwtAuth);
app.get("/resident", checkRoles('rt', "sekretaris"), getResident)
app.get("/resident/search", checkRoles('rt', 'sekretaris'), searchResidentController)
app.get("/house", checkRoles('rt'), getHouse)
app.get("/datawarga", checkRoles('rt', 'sekretaris'), getWarga)

app.post("/reveal-warga/:id", authLimiter, checkRoles('rt'), revealWarga)
app.post("/reveal-resident/:id", authLimiter, checkRoles('rt'), revealFamily)
app.post("/create-account", checkRoles('rt'), createWargaAccountController)
app.post("/create-staff-account", checkRoles('rt'), createStaffAccountController)
app.patch("/account/bind-family", checkRoles('rt', 'sekretaris'), bindAccountToFamilyController)
app.post("/register-family", checkRoles('rt', 'sekretaris'), registerFamilyController)

app.get("/pengaduan", checkRoles('rt', 'sekretaris'), reviewPengaduan)
app.patch("/pengaduan/:id", checkRoles('rt', 'sekretaris'), approvePengaduan)

app.get("/pengajuan", checkRoles('rt', 'sekretaris'), reviewPengajuan)
app.patch("/pengajuan/:id", checkRoles('rt', 'sekretaris'), approvePengajuan)

app.get("/pending-warga", checkRoles('rt', 'sekretaris'), getPendingWargaController)
app.patch("/pending-warga/:id", checkRoles('rt', 'sekretaris'), verifyWargaController)

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
app.patch("/resident/:id", verifyInput(updateResidentSchema), checkRoles('rt', 'sekretaris'), editedResident)



app.get("/finance/pending", checkRoles('rt', 'bendahara'), getPendingPaymentsController)
app.patch("/finance/approve-ipl/:id", checkRoles('rt', 'bendahara'), approveIplPaymentController)
app.patch("/finance/approve-kas/:id", checkRoles('rt', 'bendahara'), approveKasPaymentController)
app.post("/finance/expense", checkRoles('rt', 'bendahara'), recordExpenseController)
app.post("/finance/income", checkRoles('rt', 'bendahara'), recordIncomeController)
app.post("/finance/manual-payment", checkRoles('rt', 'bendahara'), recordManualPaymentController)
app.patch("/finance/settings", checkRoles('rt', 'bendahara'), updateFinancialSettingsController)
app.get("/finance/settings", checkRoles('rt', 'bendahara'), getFinancialSettingsController)
app.get("/finance/tracking", checkRoles('rt', 'bendahara'), getArrearsTrackingController)

export default app