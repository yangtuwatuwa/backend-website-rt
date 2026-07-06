import { register } from "../services/bisnisRegisterAndLogin.js";
export async function regist(req,res) {
    const {username , password , email, role} =req.body
    const hasilnya = await register(username , password , email , role)
    res.json(hasilnya)
}

