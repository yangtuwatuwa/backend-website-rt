import e from "express";
import { regist, login } from "../controllers/registandlogin.js"; 
import { regex , verifyInput } from "../middlewares/verivyGmail.js";
const app = e()

app.post("/regist", verifyInput(regex)  , regist)
app.post("/login",  login)
export default app
