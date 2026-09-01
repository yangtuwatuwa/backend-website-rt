import express from "express";
import jwtAuth from "../middlewares/validationJwt.js";
import { checkRoles } from "../middlewares/checkRole.js";
import { deleteWargaController } from "../controllers/residentController.js";
import { getProfilSayaController } from "../controllers/profilSayaController.js";

const router = express.Router();

// Tidak menerima ID dari client: identitas profil hanya berasal dari JWT.
router.get("/profil-saya", jwtAuth, checkRoles("warga"), getProfilSayaController);

// Endpoint kanonik untuk FE. Route /admin/datawarga/:id tetap dipertahankan
// sebagai compatibility route dan memakai controller/service yang sama.
router.delete("/warga/:id", jwtAuth, checkRoles("rt", "sekretaris"), deleteWargaController);

export default router;
