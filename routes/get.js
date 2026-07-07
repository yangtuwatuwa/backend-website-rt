import e from "express";
import { regist } from "../controller/registandlogin.js"; 
import {role }from "../middlewares/checkYourPermision.js"
import validationJwt from "../middlewares/validationJwt.js"
const app = e()

app.get("/adminpanel", validationJwt, role(["admin", "rt", "sekertaris", "bendahara"]), (req,res)=>{
    res.send("orang aring")
})
app.get("/suratdomisili", validationJwt, role([ "rt", "sekertaris"]), (req,res)=>{
    res.send("orang aring")
})
app.get("/y", validationJwt, role(["admin"]), (req,res)=>{
    res.send("orang aring")
})
app.get("/kuwar", validationJwt, role([ "bendahara"]), (req,res)=>{
    res.send("orang aring")
})
export default app