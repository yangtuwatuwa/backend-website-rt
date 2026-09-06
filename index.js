import express from "express"
import { createServer } from "http"

import cors from "cors"
import bodyParser from "body-parser"
import helemet from "helmet"
import userAccesRoutes from "./routes/userAcces.js"
import postRoutes from "./routes/post.js"
import authRoutes from "./routes/auth.js"
import dotenv from "dotenv"
import datasensi from "./routes/adminAcces.js"
import { apiLimiter } from "./middlewares/rateLimiter.js"
import masuk from "./middlewares/reqmasuk.js"
import { startNotificationScheduler } from "./services/notificationScheduler.js"
import { initSocket } from "./utils/socket.js"

import accountRoutes from "./routes/account.js"
import adminPanelRoutes from "./routes/adminPanel.js"
import wargaApiRoutes from "./routes/wargaApi.js"
import suratPengajuanRoutes from "./routes/suratPengajuan.js"
import notulenRapatRoutes from "./routes/notulenRapat.js"

dotenv.config()
const app = express()
const port = 3333

// Wrap Express app with HTTP server for Socket.io
const httpServer = createServer(app)
initSocket(httpServer)

//for package middlewares 

app.use(helemet())
app.use(cors())
app.use(bodyParser.json())
// app.use(apiLimiter)

// Logger buat mantau request masuk masbro
app.use(masuk)

//routes 
app.use("/auth", authRoutes)
app.use("/post", postRoutes)
app.use("/admin", datasensi)
app.use("/resident", userAccesRoutes)
app.use("/account", accountRoutes)
app.use("/api/admin", adminPanelRoutes)
app.use("/api", wargaApiRoutes)
app.use("/", suratPengajuanRoutes)
app.use("/", notulenRapatRoutes)

// Inisialisasi scheduler reminder otomatis tagihan IPL
startNotificationScheduler()

httpServer.listen(port, ()=>{
    console.log("berjalan di http://localhost:"+port)
})
