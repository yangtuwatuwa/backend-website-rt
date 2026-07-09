import e from "express";
import { regist, login } from "../controllers/registandlogin.js"; 
import { regex , verifyInput } from "../middlewares/verivyGmail.js";
import { authLimiter } from "../middlewares/rateLimiter.js";

const app = e()

app.post("/regist", authLimiter, verifyInput(regex), regist)
app.post("/login", authLimiter, login)

export default app
