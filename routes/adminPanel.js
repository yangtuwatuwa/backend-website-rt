import express from "express";
import jwtAuth from "../middlewares/validationJwt.js";
import { checkRoles } from "../middlewares/checkRole.js";
import {
    deleteRtAccountController,
    createRtAccountController,
    getStaffAccountsController,
    deleteStaffAccountController,
    getAuditLogsController
} from "../controllers/adminPanelController.js";

const router = express.Router();

// Endpoint #1: Hapus Akun RT (Cabut Jabatan = Hard Delete)
router.delete("/positions/rt/:id", jwtAuth, checkRoles("admin"), deleteRtAccountController);

// Endpoint #2: Buat Jabatan / Akun RT Baru
router.post("/positions/rt", jwtAuth, checkRoles("admin"), createRtAccountController);

// Endpoint #3: List & Hapus Akun Bendahara/Sekretaris
router.get("/accounts", jwtAuth, checkRoles("admin"), getStaffAccountsController);
router.delete("/accounts/:id", jwtAuth, checkRoles("admin"), deleteStaffAccountController);

// Endpoint #4: Audit Log (Read-Only)
router.get("/audit-logs", jwtAuth, checkRoles("admin"), getAuditLogsController);

export default router;
