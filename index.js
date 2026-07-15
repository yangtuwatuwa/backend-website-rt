import express from "express"

import cors from "cors"
import bodyParser from "body-parser"
import helemet from "helmet"
import userAccesRoutes from "./routes/userAcces.js"
import postRoutes from "./routes/post.js"
import dotenv from "dotenv"
import datasensi from "./routes/adminAcces.js"
import { apiLimiter } from "./middlewares/rateLimiter.js"
import masuk from "./middlewares/reqmasuk.js"
import { startNotificationScheduler } from "./services/notificationScheduler.js"

dotenv.config()
const app = express()
const port =3333
//for package middlewares 
app.use(helemet())
app.use(cors())
app.use(bodyParser.json())


// Logger buat mantau request masuk masbro
app.use(masuk)

//routes 


app.use("/post", postRoutes)
app.use("/admin", datasensi)
app.use("/resident", userAccesRoutes)

// Inisialisasi scheduler reminder otomatis tagihan IPL
startNotificationScheduler()

app.listen(port, ()=>{
    console.log("berjalan di http://localhost:"+port)
})