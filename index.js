import express from "express"
import cors from "cors"
import bodyParser from "body-parser"
import helemet from "helmet"
import getRoutes from "./routes/get.js"
import postRoutes from "./routes/post.js"
const app = express()

//for package middlewares 
app.use(helemet)
app.use(cors)
app.use(bodyParser.json())

//routes 

app.use("/",getRoutes)
app.use("/post", postRoutes)
