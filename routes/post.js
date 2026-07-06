import e from "express";
import { regist } from "../controller/registandlogin.js"; 

const app = e()

app.post("/regist", regist)

export default app