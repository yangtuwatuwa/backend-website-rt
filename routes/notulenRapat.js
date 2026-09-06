import express from "express";
import {
    createNotulenRapatController,
    editNotulenRapatController,
    getNotulenRapatController,
    getNotulenRapatDetailController,
    removeNotulenRapatController,
} from "../controllers/notulenRapat.js";
import jwtAuth from "../middlewares/validationJwt.js";
import { checkRoles } from "../middlewares/checkRole.js";
import {
    notulenRapatSchema,
    updateNotulenRapatSchema,
    verifyInput,
} from "../middlewares/verivyGmail.js";

const router = express.Router();

router.use(jwtAuth);

// Pengumuman warga dapat dibaca oleh setiap akun terautentikasi; notulen
// mengikuti pola read-access yang sama.
router.get("/notulen-rapat", getNotulenRapatController);
router.get("/notulen-rapat/:id", getNotulenRapatDetailController);

router.post(
    "/notulen-rapat",
    checkRoles("sekertaris"),
    verifyInput(notulenRapatSchema),
    createNotulenRapatController,
);
router.patch(
    "/notulen-rapat/:id",
    checkRoles("sekertaris"),
    verifyInput(updateNotulenRapatSchema),
    editNotulenRapatController,
);
router.delete("/notulen-rapat/:id", checkRoles("sekertaris"), removeNotulenRapatController);

export default router;
