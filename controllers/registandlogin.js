import { register, loginUser } from "../services/bisnisRegisterAndLogin.js";
import { generateJwt } from "../helpers/jwttoken.js";
export async function regist(req, res) {
    const { username, password, email, role, family_id, familyId } = req.body
    const targetFamilyId = family_id || familyId || null
    console.log(`[Request Register] username: ${username}, email: ${email}, role: ${role}, familyId: ${targetFamilyId}`)

    // ---- Validation ----
    if (!username || !password || !email || !role) {
        console.log('[Error Register] payload incomplete')
        return res.status(400).json({ pesan: 'payload register tidak lengkap' })
    }

    const hasilnya = await register(username, password, email, role, targetFamilyId)
    console.log(`[Response Register] hasil:`, hasilnya)

    // Jika service mengembalikan error string, kirim 400
    if (typeof hasilnya === 'string' && hasilnya.startsWith('error')) {
        return res.status(400).json({ pesan: hasilnya })
    }
    return res.status(201).json(hasilnya)
}
export async function login(req,res) {
    const {username , password} =req.body
    console.log(`[Request Login] username: ${username}`)
    const hasilnya = await loginUser(username , password)
    console.log(`[Response Login] hasil:`, hasilnya)
    res.json(hasilnya)
}

