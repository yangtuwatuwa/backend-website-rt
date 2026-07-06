import express from "express"
<<<<<<< HEAD
import bodyParser from "body-parser"
import helmet from "helmet"
import cors from "cors"
import rateLimit from "express-rate-limit"


const app = express()

app.use(helmet)
app.use(cors)
app.use(bodyParser.json())
app.use("/inputcomondata", )
app.use("/output")
=======
import cors from "cors"
import bodyParser from "body-parser"
import helemet from "helemet"
import getRoutes from "./routes/get.js"
const app = express()

//for package middlewares 
app.use(helemet)
app.use(cors)
app.use(bodyParser.json())

//routes 

app.use("/",)
>>>>>>> 67b113c6fa467168f62ac762cf53ee99d0f0a7c0
