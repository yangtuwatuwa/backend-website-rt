import express from "express"
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