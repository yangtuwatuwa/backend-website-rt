import { register, loginUser } from "../services/bisnisRegisterAndLogin.js";
import { generateJwt } from "../helpers/jwttoken.js";
export async function regist(req,res) {
    const {username , password , email, role} =req.body
    console.log(`[Request Register] username: ${username}, email: ${email}, role: ${role}`)
    const hasilnya = await register(username , password , email , role)
    console.log(`[Response Register] hasil:`, hasilnya)
    res.json(hasilnya)
}
export async function login(req,res) {
    const {username , password} =req.body
    console.log(`[Request Login] username: ${username}`)
    const hasilnya = await loginUser(username , password)
    console.log(`[Response Login] hasil:`, hasilnya)
    res.json(hasilnya)
}

