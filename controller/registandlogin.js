import { register, login } from "../services/bisnisRegisterAndLogin.js";
export async function regist(req,res) {
    const {username , password , email, role} =req.body
    const hasilnya = await register(username , password , email , role)
    return res.json(hasilnya)
}

export async function masuk(req,res) {
    const {username , password} =req.body
    const hasilnya = await login(username , password)
    return res.json(hasilnya)
}

