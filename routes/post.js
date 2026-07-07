import e from "express";
import { regist, masuk } from "../controller/registandlogin.js"; 

const app = e()

app.post("/regist", regist)
app.post("/login", masuk)

export default app