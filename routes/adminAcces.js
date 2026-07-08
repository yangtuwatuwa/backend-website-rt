import e from "express";
import {inputData, getResident }from "../controllers/sensitifData.js"
import { verifyInput, residentSchema } from "../middlewares/verivyGmail.js"
const app = e()

app.get("/resident", getResident)
// TODO: Tambahkan controller/handler untuk route di bawah ini agar tidak crash ("argument handler is required")
// app.get("/payment")
// app.get("/announcment")
// app.get("/familycard")

// app.post("/address")
// app.post("/announcmnet")
app.post("/resident", verifyInput(residentSchema), inputData)
// app.post("")

// app.patch("/resident/:id")
// app.delete("/resident")


export default app