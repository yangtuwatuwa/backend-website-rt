import express from "express"

import cors from "cors"
import bodyParser from "body-parser"
import helemet from "helmet"

import postRoutes from "./routes/post.js"
import dotenv from "dotenv"
import datasensi from "./routes/adminAcces.js"

dotenv.config()
const app = express()
const port =3333
//for package middlewares 
app.use(helemet())
app.use(cors())
app.use(bodyParser.json())

//routes 


app.use("/post", postRoutes)
app.use("/admin", datasensi)
app.listen(port, ()=>{
    console.log("berjalan di http://localhost:"+port)
})