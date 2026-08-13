import express from "express"
import family, { changePasswordController } from "../controllers/familys.js"
import jwtAuth from "../middlewares/validationJwt.js"
import { addPengaduan, checkStatusPengaduan } from "../controllers/pengaduan.js"
import { addPengajuan, checkStatusPengajuan } from "../controllers/pengajuan.js"
import { getAnnouncementsController } from "../controllers/announcement.js"
import { getAgendasController } from "../controllers/agenda.js"
import { createWargaByResident, updateWargaDetailsController } from "../controllers/residentController.js"
import { uploadSensitifDataController, downloadSensitifFileController, deleteSensitifDataController } from "../controllers/documentController.js"
import { uploadSensitifMiddleware } from "../middlewares/multerConfig.js"

import { getMyAccountController, updateMyAccountController } from "../controllers/accountProfileController.js"

const router = express.Router()


router.get("/getmyfamily/:id", jwtAuth, family)
router.patch("/password", jwtAuth, changePasswordController)

// Route Profil / Akun Mandiri User (Lihat & Edit Username, Email, Password)
router.get("/my-account", jwtAuth, getMyAccountController)
router.get("/profile", jwtAuth, getMyAccountController)
router.patch("/my-account", jwtAuth, updateMyAccountController)
router.patch("/profile", jwtAuth, updateMyAccountController)

// Route Pengaduan Warga
router.post("/pengaduan", jwtAuth, addPengaduan)
router.get("/pengaduan", jwtAuth, checkStatusPengaduan)

// Route Pengajuan Warga
router.post("/pengajuan", jwtAuth, addPengajuan)
router.get("/pengajuan", jwtAuth, checkStatusPengajuan)

// Route Pendaftaran Anggota Keluarga Mandiri (Pending & Upload KTP Opsional)
router.post("/datawarga", jwtAuth, uploadSensitifMiddleware, createWargaByResident)

// Route Upload, Download & Hapus Dokumen Sensitif Warga
router.post("/uploadsensitifdata/:id", jwtAuth, uploadSensitifMiddleware, uploadSensitifDataController)
router.get("/sensitifdata/file/:document_id", jwtAuth, downloadSensitifFileController)
router.delete("/sensitifdata/:id", jwtAuth, deleteSensitifDataController)


// Route Pembaruan Data Warga (Profil / Meninggal) - RBAC & Owner Only
router.patch("/warga/:id", jwtAuth, updateWargaDetailsController)



// Route Pengumuman Warga (Melihat Pengumuman)
router.get("/announcement", jwtAuth, getAnnouncementsController)

// Route Agenda Kegiatan Warga
router.get("/agenda", jwtAuth, getAgendasController)

// Route Keuangan / Pembayaran Warga Mandiri
import { payIplController, payKasController, getFamilyPaymentsController } from "../controllers/financeController.js"
import { idempotencyMiddleware } from "../middlewares/idempotency.js"
import { createPaymentSessionController, checkPaymentStatusController } from "../controllers/paymentGatewayController.js"

router.post("/pay-ipl", jwtAuth, idempotencyMiddleware(), uploadSensitifMiddleware, payIplController)
router.post("/pay-kas", jwtAuth, idempotencyMiddleware(), uploadSensitifMiddleware, payKasController)
router.get("/my-payments", jwtAuth, getFamilyPaymentsController)
router.post("/payment-gateway/checkout", jwtAuth, idempotencyMiddleware(), createPaymentSessionController)
router.get("/payment-gateway/status/:orderId", jwtAuth, checkPaymentStatusController)


// Route Vote Karyawan Terbaik
import { getKaryawanListController, postVoteController, getVoteResultsController } from "../controllers/karyawan.js"
router.get("/karyawan", jwtAuth, getKaryawanListController)
router.post("/vote", jwtAuth, postVoteController)
router.get("/vote/results", jwtAuth, getVoteResultsController)

// Route Template Surat Warga (Melihat & Unduh Format)
import { getTemplateSuratListController, downloadTemplateSuratController } from "../controllers/templateSuratController.js"
router.get("/template-surat", jwtAuth, getTemplateSuratListController)
router.get("/template-surat/download/:id", jwtAuth, downloadTemplateSuratController)

export default router