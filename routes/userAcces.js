import express from "express"
import family, { changePasswordController } from "../controllers/familys.js"
import jwtAuth from "../middlewares/validationJwt.js"
import { addPengaduan, checkStatusPengaduan } from "../controllers/pengaduan.js"
import { addPengajuan, checkStatusPengajuan } from "../controllers/pengajuan.js"
import { getAnnouncementsController } from "../controllers/announcement.js"
import { createWargaByResident } from "../controllers/sensitifData.js"

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



// Route Pengumuman Warga (Melihat Pengumuman)
router.get("/announcement", jwtAuth, getAnnouncementsController)


export default router