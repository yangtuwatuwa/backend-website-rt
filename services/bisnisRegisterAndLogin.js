import registerAccount from "../models/register.js";
import loginAccount from "../models/login.js";
import { argonhash, argonverify } from "../helpers/argon2.js";
import { encryptEmails } from "../helpers/ciihper.js";
import { generateJwt } from "../helpers/jwttoken.js";

export async function register(username, password,email ,role ){
    const pasplaintext = await argonhash(password)
    const emailsEncrypt = await encryptEmails(email)
    const hasilny = await registerAccount(username , pasplaintext , emailsEncrypt , role)
    return hasilny; 
}
export async function loginUser(username, password){
    const hasilny = await loginAccount(username)
    if (hasilny === "error") {
        return "error"
    }
    if (hasilny.length === 0) {
        return "username tidak ditemukan"
    }


    const user = hasilny[0]
    const checkPassword = await argonverify(user.password, password)
    
    if (checkPassword === true) {
         const token = generateJwt({
            id:user.id,
            role:user.role
         })
         
         if (user.must_change_password === 1) {
             return { status: "must_change_password", user: user, token: token }
         }
         return { status: "login berhasil", user: user, token:token }
    } else {
        return "password salah"
    }
}