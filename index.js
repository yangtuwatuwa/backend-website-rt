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

// Inisialisasi scheduler reminder otomatis tagihan IPL
startNotificationScheduler()

httpServer.listen(port, ()=>{
    console.log("berjalan di http://localhost:"+port)
})