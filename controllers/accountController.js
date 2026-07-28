import { generateWargaAccount, generateStaffAccount, bindAccountToFamilyService } from "../services/createAccount.js"
import { responseSucces } from "../utils/response.js"
import { emitSyncEvent } from "../utils/socket.js"

export async function createWargaAccountController(req, res) {
    const { familyId, family_id } = req.body;
    const targetFamilyId = familyId || family_id;
    console.log(`[Request Create Warga Account] familyId: ${targetFamilyId}`);
    
    // ---- Validation ----
    if (!targetFamilyId) {
        console.log('[Error Create Warga Account] familyId missing');
        return res.status(400).json({ pesan: 'familyId wajib diisi untuk membuat akun warga' });
    }
    try {
        const account = await generateWargaAccount(targetFamilyId);
        console.log(`[Response Create Warga Account] hasil:`, account);
        if (typeof account === "string" && account.startsWith('error')) {
            return res.status(400).json({ pesan: account });
        }
        emitSyncEvent("warga")
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

export async function bindAccountToFamilyController(req, res) {
    const { userId, user_id, familyId, family_id } = req.body
    const targetUserId = userId || user_id
    const targetFamilyId = familyId || family_id

    console.log(`[Request Bind Account Family] userId: ${targetUserId}, familyId: ${targetFamilyId}`)

    if (!targetUserId || !targetFamilyId) {
        return res.status(400).json({ pesan: "userId dan familyId wajib diisi masbro!" })
    }

    try {
        const result = await bindAccountToFamilyService(targetUserId, targetFamilyId)
        console.log(`[Response Bind Account Family] hasil:`, result)
        if (typeof result === "string" && result.startsWith("error")) {
            return res.status(400).json({ pesan: result })
        }
        return responseSucces(200, result, "Akun warga berhasil dihubungkan ke Kartu Keluarga (family_id)!", res)
    } catch (err) {
        console.log(`[Error Bind Account Family]:`, err)
        return res.status(500).json({ pesan: "error mas di controller bindAccountToFamilyController: " + err })
    }
}
