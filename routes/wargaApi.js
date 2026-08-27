import express from "express";
import jwtAuth from "../middlewares/validationJwt.js";
import { checkRoles } from "../middlewares/checkRole.js";
import { deleteWargaController } from "../controllers/residentController.js";

const router = express.Router();

// Endpoint kanonik untuk FE. Route /admin/datawarga/:id tetap dipertahankan
// sebagai compatibility route dan memakai controller/service yang sama.
router.delete("/warga/:id", jwtAuth, checkRoles("rt", "sekretaris"), deleteWargaController);

export default router;
