import express from "express"
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