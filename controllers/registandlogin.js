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
    const {username , password} = req.body
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || "127.0.0.1"
    const userAgent = req.headers['user-agent'] || "unknown"
    console.log(`[Request Login] username: ${username}, ip: ${ipAddress}`)
    const hasilnya = await loginUser(username, password, ipAddress, userAgent)
    console.log(`[Response Login] status: ${typeof hasilnya === "object" ? hasilnya.status : hasilnya}`)
    res.json(hasilnya)
}


