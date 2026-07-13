import e from "express";
import { regist, login } from "../controllers/registandlogin.js"; 
import { regex , verifyInput } from "../middlewares/verivyGmail.js";
import { authLimiter } from "../middlewares/rateLimiter.js";
import { setRoleRt } from "../middlewares/setRoleRt.js";

const app = e()


app.post("/login", authLimiter, login)
app.post("/debug-regist", setRoleRt, verifyInput(regex), regist);


export default app
