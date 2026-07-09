import e from "express";
import {warga, inputData, getResident, editedResident, inputHouse, getHouse, getWarga, revealWarga, revealFamily } from "../controllers/sensitifData.js"
import { verifyInput, residentSchema, updateResidentSchema } from "../middlewares/verivyGmail.js"
import jwtAuth from "../middlewares/validationJwt.js"
import { checkRt } from "../middlewares/checkRt.js"
import { authLimiter } from "../middlewares/rateLimiter.js"

const app = e()

// Pasang JWT middleware di semua route admin
app.use(jwtAuth);
app.get("/resident", checkRt, getResident)
app.get("/house", checkRt, getHouse)
app.get("/datawarga", checkRt, getWarga)

// Reveal NIK & No KK setelah password verifikasi (Sudo Mode)
app.post("/reveal-warga/:id", authLimiter, checkRt, revealWarga)
app.post("/reveal-resident/:id", authLimiter, checkRt, revealFamily)

// TODO: Tambahkan controller/handler untuk route di bawah ini agar tidak crash ("argument handler is required")
// app.get("/payment")
// app.get("/announcment")
// app.get("/familycard")

// app.post("/address")
// app.post("/announcmnet")
app.post("/resident", verifyInput(residentSchema), inputData)
app.post("/house", inputHouse )
app.post("/datawarga", warga)
app.patch("/resident/:id", verifyInput(updateResidentSchema), editedResident)
// app.delete("/resident")

export default app