import express from "express";
import jwtAuth from "../middlewares/validationJwt.js";
import { checkRoles } from "../middlewares/checkRole.js";
import {
    approveSuratPengajuanController,
    createSuratKategoriController,
    createSuratPengajuanController,
    getSuratPengajuanDetailController,
    listSuratKategoriController,
    listSuratPengajuanController,
    rejectSuratPengajuanController,
} from "../controllers/suratPengajuanController.js";

const router = express.Router();

router.use(jwtAuth);

router.post("/surat-pengajuan", checkRoles("warga"), createSuratPengajuanController);
router.get("/surat-pengajuan", checkRoles("rt", "sekertaris", "admin", "superadmin"), listSuratPengajuanController);
router.get("/surat-pengajuan/:id", checkRoles("warga", "rt", "sekertaris", "admin", "superadmin"), getSuratPengajuanDetailController);
router.patch("/surat-pengajuan/:id/approve", checkRoles("rt", "sekertaris"), approveSuratPengajuanController);
router.patch("/surat-pengajuan/:id/reject", checkRoles("rt", "sekertaris"), rejectSuratPengajuanController);

router.get("/surat-kategori", listSuratKategoriController);
router.post("/surat-kategori", checkRoles("admin", "superadmin"), createSuratKategoriController);

export default router;
