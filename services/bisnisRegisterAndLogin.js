import registerAccount from "../models/register.js";
import findAccount from "../models/login.js";
import { argonhash, argonverify } from "../helpers/argon2.js";
import { encryptEmails } from "../helpers/ciihper.js";

export async function register(username, password,email ,role ){
    const pasplaintext = await argonhash(password)
    const emailsEncrypt = await encryptEmails(email)
    const hasilny = await registerAccount(username , pasplaintext , emailsEncrypt , role)
    return hasilny; 
}

export async function login(username, password){
    const user = await findAccount(username)
    if (!user || user.error) {
        return "user tidak ditemukan"
    }
    const cekPassword = await argonverify(password, user.password)
    if (!cekPassword) {
        return "password salah"
    }
    return { status: "success", user: { id: user.id, username: user.username, email: user.email, role: user.role } }
}