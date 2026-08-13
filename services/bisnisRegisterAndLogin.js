import registerAccount from "../models/register.js";
import loginAccount from "../models/login.js";
import { argonhash, argonverify } from "../helpers/argon2.js";
import { encryptEmails } from "../helpers/ciihper.js";
import { generateJwt } from "../helpers/jwttoken.js";
import { createAccessLog } from "../models/accessLogs.js";
import { toSafeUser } from "../helpers/sanitizeUser.js";

export async function register(username, password, email, role = "warga", familyId = null) {
    const pasplaintext = await argonhash(password)
    const emailsEncrypt = await encryptEmails(email)
    const hasilny = await registerAccount(username, pasplaintext, emailsEncrypt, role, familyId)
    return hasilny; 
}
export async function loginUser(username, password, ipAddress = "127.0.0.1", userAgent = "unknown"){
    const hasilny = await loginAccount(username)
    if (hasilny === "error") {
        await createAccessLog(username, "LOGIN_ATTEMPT", ipAddress, userAgent, "failed", "DB error")
        return "error"
    }
    if (hasilny.length === 0) {
        await createAccessLog(username, "LOGIN_ATTEMPT", ipAddress, userAgent, "failed", "Username tidak ditemukan")
        return "username tidak ditemukan"
    }

    const user = hasilny[0]
    const checkPassword = await argonverify(user.password, password)
    
    if (checkPassword === true) {
         const token = generateJwt({
            id:user.id,
            role:user.role
         })
         
         await createAccessLog(username, "LOGIN_SUCCESS", ipAddress, userAgent, "success", `Role: ${user.role}`)

         // Sanitize: JANGAN pernah kirim password hash ke client
         const safeUser = toSafeUser(user)

         if (user.must_change_password === 1) {
             return { status: "must_change_password", user: safeUser, token: token }
         }
         return { status: "login berhasil", user: safeUser, token: token }
    } else {
        await createAccessLog(username, "LOGIN_FAILED", ipAddress, userAgent, "failed", "Password salah")
        return "password salah"
    }
}