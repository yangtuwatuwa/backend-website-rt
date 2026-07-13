import e from "express";
import {warga, inputData, getResident, editedResident, inputHouse, getHouse, getWarga, revealWarga, revealFamily, createWargaAccountController, getPendingWargaController, verifyWargaController, createStaffAccountController } from "../controllers/sensitifData.js"
import { reviewPengaduan, approvePengaduan } from "../controllers/pengaduan.js"
import { reviewPengajuan, approvePengajuan } from "../controllers/pengajuan.js"

import { verifyInput, residentSchema, updateResidentSchema, announcementSchema, updateAnnouncementSchema } from "../middlewares/verivyGmail.js"
import { createAnnouncementController, getAnnouncementsController, editAnnouncementController, removeAnnouncementController } from "../controllers/announcement.js"
import jwtAuth from "../middlewares/validationJwt.js"
import { checkRoles } from "../middlewares/checkRole.js"
import { authLimiter } from "../middlewares/rateLimiter.js"

const app = e()


app.use(jwtAuth);
app.get("/resident", checkRoles('rt'), getResident)
app.get("/house", checkRoles('rt'), getHouse)
app.get("/datawarga", checkRoles('rt'), getWarga)

app.post("/reveal-warga/:id", authLimiter, checkRoles('rt'), revealWarga)
app.post("/reveal-resident/:id", authLimiter, checkRoles('rt'), revealFamily)
app.post("/create-account", checkRoles('rt'), createWargaAccountController)
app.post("/create-staff-account", checkRoles('rt'), createStaffAccountController)

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


app.post("/resident", verifyInput(residentSchema), checkRoles('rt', 'sekretaris'), inputData)
app.post("/house", checkRoles('rt', 'sekretaris'), inputHouse )
app.post("/datawarga", checkRoles('rt', 'sekretaris'), warga)
app.patch("/resident/:id", verifyInput(updateResidentSchema), checkRoles('rt', 'sekretaris'), editedResident)

// Route Keuangan / Finansial Pengurus RT
import { 
    getPendingPaymentsController, 
    approveIplPaymentController, 
    approveKasPaymentController, 
    recordExpenseController, 
    updateFinancialSettingsController, 
    getArrearsTrackingController 
} from "../controllers/financeController.js"

app.get("/finance/pending", checkRoles('rt', 'bendahara'), getPendingPaymentsController)
app.patch("/finance/approve-ipl/:id", checkRoles('rt', 'bendahara'), approveIplPaymentController)
app.patch("/finance/approve-kas/:id", checkRoles('rt', 'bendahara'), approveKasPaymentController)
app.post("/finance/expense", checkRoles('rt', 'bendahara'), recordExpenseController)
app.patch("/finance/settings", checkRoles('rt', 'bendahara'), updateFinancialSettingsController)
app.get("/finance/tracking", checkRoles('rt', 'bendahara'), getArrearsTrackingController)

export default app