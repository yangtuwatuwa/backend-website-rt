import { generateWargaAccount, generateStaffAccount } from "../services/createAccount.js"
import { responseSucces } from "../utils/response.js"

export async function createWargaAccountController(req, res) {
    const { familyId } = req.body;
    console.log(`[Request Create Warga Account] familyId: ${familyId}`);
    // ---- Validation ----
    if (!familyId) {
        console.log('[Error Create Warga Account] familyId missing');
        return res.status(400).json({ pesan: 'familyId wajib diisi untuk membuat akun warga' });
    }
    try {
        const account = await generateWargaAccount(familyId);
        console.log(`[Response Create Warga Account] hasil:`, account);
        if (typeof account === "string" && account.startsWith('error')) {
            return res.status(400).json({ pesan: account });
        }
        return responseSucces(200, account, "Akun berhasil dibuat", res);
    } catch (err) {
        console.log(`[Error Create Warga Account]:`, err);
        return res.status(500).json({ pesan: "error mas di controller: " + err });
    }
}

export async function createStaffAccountController(req, res) {
    const { username, password, email, role } = req.body
    console.log(`[Request Create Staff Account] username: ${username}, email: ${email}, role: ${role}`)

    const allowedStaffRoles = ["sekertaris", "sekretaris", "bendahara"]
    if (!role || !allowedStaffRoles.includes(role)) {
        console.log(`[Response Create Staff Account] Gagal: Role ${role} tidak valid`)
        return res.status(400).json({ pesan: "Role staff tidak valid masbro! Cuma boleh sekertaris atau bendahara." })
    }

    const mappedRole = (role === "sekretaris") ? "sekertaris" : role

    try {
        const account = await generateStaffAccount(username, password, email, mappedRole)
        console.log(`[Response Create Staff Account] hasil:`, account)
        if (typeof account === "string" && account.startsWith("error")) {
            return res.status(400).json({ pesan: account })
        }
        return responseSucces(200, account, "Akun staff berhasil dibuat masbro", res)
    } catch (err) {
        console.log(`[Error Create Staff Account]:`, err)
        return res.status(500).json({ pesan: "error mas di controller: " + err })
    }
}
