import e from "express";
import {warga, inputData, getResident, editedResident, inputHouse, getHouse, getWarga, revealWarga, revealFamily, createWargaAccountController, getPendingWargaController, verifyWargaController } from "../controllers/sensitifData.js"
import { reviewPengaduan, approvePengaduan } from "../controllers/pengaduan.js"
import { reviewPengajuan, approvePengajuan } from "../controllers/pengajuan.js"

import { verifyInput, residentSchema, updateResidentSchema, announcementSchema, updateAnnouncementSchema } from "../middlewares/verivyGmail.js"
import { createAnnouncementController, getAnnouncementsController, editAnnouncementController, removeAnnouncementController } from "../controllers/announcement.js"
import jwtAuth from "../middlewares/validationJwt.js"
import { checkRt } from "../middlewares/checkRt.js"
import { authLimiter } from "../middlewares/rateLimiter.js"

const app = e()


app.use(jwtAuth);
app.get("/resident", checkRt, getResident)
app.get("/house", checkRt, getHouse)
app.get("/datawarga", checkRt, getWarga)

app.post("/reveal-warga/:id", authLimiter, checkRt, revealWarga)
app.post("/reveal-resident/:id", authLimiter, checkRt, revealFamily)
app.post("/create-account", checkRt, createWargaAccountController)

app.get("/pengaduan", checkRt, reviewPengaduan)
app.patch("/pengaduan/:id", checkRt, approvePengaduan)

app.get("/pengajuan", checkRt, reviewPengajuan)
app.patch("/pengajuan/:id", checkRt, approvePengajuan)

app.get("/pending-warga", checkRt, getPendingWargaController)
app.patch("/pending-warga/:id", checkRt, verifyWargaController)



app.post("/announcement", verifyInput(announcementSchema), checkRt, createAnnouncementController)
app.get("/announcement", checkRt, getAnnouncementsController)
app.patch("/announcement/:id", verifyInput(updateAnnouncementSchema), checkRt, editAnnouncementController)
app.delete("/announcement/:id", checkRt, removeAnnouncementController)


app.post("/resident", verifyInput(residentSchema), inputData)
app.post("/house", inputHouse )
app.post("/datawarga", warga)
app.patch("/resident/:id", verifyInput(updateResidentSchema), editedResident)
export default app