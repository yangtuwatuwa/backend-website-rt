import express from "express"
import dotenv from "dotenv"
dotenv.config({ override: true })
import cors from "cors"
import bodyParser from "body-parser"
import helemet from "helmet"
import getRoutes from "./routes/get.js"
import postRoutes from "./routes/post.js"
const app = express()
const port =3333
//for package middlewares 
app.use(helemet())
app.use(cors())
app.use(bodyParser.json())

//routes 

app.use("/",getRoutes)
app.use("/post", postRoutes)

app.listen(port, ()=>{
    console.log("data ready di http://localhost:"+port)
})