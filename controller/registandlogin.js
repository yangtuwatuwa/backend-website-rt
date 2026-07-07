<<<<<<< HEAD
import { register, login } from "../services/bisnisRegisterAndLogin.js";
=======
import { register, loginUser } from "../services/bisnisRegisterAndLogin.js";
import { generateJwt } from "../helpers/jwttoken.js";
>>>>>>> e08c97b221af26f0310001b10610cd3ec5b3d0ec
export async function regist(req,res) {
    const {username , password , email, role} =req.body
    console.log(`[Request Register] username: ${username}, email: ${email}, role: ${role}`)
    const hasilnya = await register(username , password , email , role)
<<<<<<< HEAD
    return res.json(hasilnya)
}

export async function masuk(req,res) {
    const {username , password} =req.body
    const hasilnya = await login(username , password)
    return res.json(hasilnya)
=======
    console.log(`[Response Register] hasil:`, hasilnya)
    res.json(hasilnya)
}
export async function login(req,res) {
    const {username , password} =req.body
    console.log(`[Request Login] username: ${username}`)
    const hasilnya = await loginUser(username , password)
    console.log(`[Response Login] hasil:`, hasilnya)
    res.json(hasilnya)
>>>>>>> e08c97b221af26f0310001b10610cd3ec5b3d0ec
}

