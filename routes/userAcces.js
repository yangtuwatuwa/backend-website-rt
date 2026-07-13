import express from "express"
import family, { changePasswordController } from "../controllers/familys.js"
import jwtAuth from "../middlewares/validationJwt.js"
import { addPengaduan, checkStatusPengaduan } from "../controllers/pengaduan.js"
import { addPengajuan, checkStatusPengajuan } from "../controllers/pengajuan.js"
import { getAnnouncementsController } from "../controllers/announcement.js"
import { createWargaByResident, uploadSensitifDataController, downloadSensitifFileController, updateWargaDetailsController } from "../controllers/sensitifData.js"
import { uploadSensitifMiddleware } from "../middlewares/multerConfig.js"

const router = express.Router()


router.get("/getmyfamily/:id", jwtAuth, family)
router.patch("/password", jwtAuth, changePasswordController)

// Route Pengaduan Warga
router.post("/pengaduan", jwtAuth, addPengaduan)
router.get("/pengaduan", jwtAuth, checkStatusPengaduan)

// Route Pengajuan Warga
router.post("/pengajuan", jwtAuth, addPengajuan)
router.get("/pengajuan", jwtAuth, checkStatusPengajuan)

// Route Pendaftaran Anggota Keluarga Mandiri (Pending)
router.post("/datawarga", jwtAuth, createWargaByResident)

// Route Upload & Download Dokumen Sensitif Warga
router.post("/uploadsensitifdata/:id", jwtAuth, uploadSensitifMiddleware, uploadSensitifDataController)
router.get("/sensitifdata/file/:document_id", jwtAuth, downloadSensitifFileController)

// Route Pembaruan Data Warga (Profil / Meninggal) - RBAC & Owner Only
router.patch("/warga/:id", jwtAuth, updateWargaDetailsController)



// Route Pengumuman Warga (Melihat Pengumuman)
router.get("/announcement", jwtAuth, getAnnouncementsController)

// Route Keuangan / Pembayaran Warga Mandiri
import { payIplController, payKasController, getFamilyPaymentsController } from "../controllers/financeController.js"
router.post("/pay-ipl", jwtAuth, uploadSensitifMiddleware, payIplController)
router.post("/pay-kas", jwtAuth, uploadSensitifMiddleware, payKasController)
router.get("/my-payments", jwtAuth, getFamilyPaymentsController)

export default router