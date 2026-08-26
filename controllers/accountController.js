import { generateWargaAccount, generateStaffAccount, bindAccountToFamilyService, checkAccountStatusService } from "../services/createAccount.js"
import { responseSucces } from "../utils/response.js"
import { emitSyncEvent } from "../utils/socket.js"

export async function createWargaAccountController(req, res) {
    const { familyId, family_id, username, password, email } = req.body;
    const targetFamilyId = familyId || family_id;
    console.log(`[Request Create Warga Account] familyId: ${targetFamilyId}, username: ${username}, email: ${email}`);
    
    // ---- Validation ----
    if (!targetFamilyId) {
        console.log('[Error Create Warga Account] familyId missing');
        return res.status(400).json({ pesan: 'familyId wajib diisi untuk membuat akun warga' });
    }
    if (!username || !String(username).trim()) {
        return res.status(400).json({ pesan: 'Username wajib diisi' });
    }
    if (!password || !String(password).trim()) {
        return res.status(400).json({ pesan: 'Password wajib diisi' });
    }
    if (!email || !String(email).trim()) {
        return res.status(400).json({ pesan: 'Email wajib diisi' });
    }

    try {
        const account = await generateWargaAccount(targetFamilyId, String(username).trim(), String(password).trim(), String(email).trim());
        console.log(`[Response Create Warga Account] akun berhasil dibuat untuk familyId: ${targetFamilyId}`);
        if (typeof account === "string" && account.startsWith('error')) {
            return res.status(400).json({ pesan: account });
        }
        emitSyncEvent("warga");

        return res.status(201).json({
            response: 201,
            success: true,
            userId: account.userId || account.insertId,
            insertId: account.insertId || account.userId,
            username: account.username,
            temporaryPassword: account.temporaryPassword || password,
            output: {
                userId: account.userId || account.insertId,
                insertId: account.insertId || account.userId,
                username: account.username,
                temporaryPassword: account.temporaryPassword || password
            },
            data: {
                userId: account.userId || account.insertId,
                insertId: account.insertId || account.userId,
                username: account.username,
                temporaryPassword: account.temporaryPassword || password
            },
            message: account.message || "Akun berhasil dibuat dan kode OTP verifikasi telah dikirim ke email warga."
        });
    } catch (err) {
        console.log(`[Error Create Warga Account]:`, err);
        return res.status(500).json({ pesan: "error mas di controller: " + err });
    }
}

export async function createStaffAccountController(req, res) {
    const { username, password, email, role } = req.body
    console.log(`[Request Create Staff Account] username: ${username}, email: ${email}, role: ${role}`)

    const allowedStaffRoles = ["sekertaris", "sekretaris", "bendahara"]
    if (!username || !String(username).trim()) {
        return res.status(400).json({ pesan: "Username wajib diisi" });
    }
    if (!password || !String(password).trim()) {
        return res.status(400).json({ pesan: "Password wajib diisi" });
    }
    if (!email || !String(email).trim()) {
        return res.status(400).json({ pesan: "Email wajib diisi" });
    }
    if (!role || !allowedStaffRoles.includes(role)) {
        console.log(`[Response Create Staff Account] Gagal: Role ${role} tidak valid`)
        return res.status(400).json({ pesan: "Role staff tidak valid masbro! Cuma boleh sekertaris atau bendahara." })
    }

    const mappedRole = (role === "sekretaris") ? "sekertaris" : role

    try {
        const account = await generateStaffAccount(String(username).trim(), String(password).trim(), String(email).trim(), mappedRole)
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

export async function checkAccountStatusController(req, res) {
    const { familyId } = req.params;
    const targetFamilyId = familyId || req.query.familyId || req.query.family_id;
    console.log(`[Request Check Account Status] familyId: ${targetFamilyId}`);

    if (!targetFamilyId) {
        return res.status(400).json({ pesan: "familyId wajib diisi masbro!" });
    }

    try {
        const result = await checkAccountStatusService(targetFamilyId);
        console.log(`[Response Check Account Status] hasil:`, result);
        if (typeof result === "string" && result.startsWith("error")) {
            return res.status(400).json({ pesan: result });
        }
        return res.status(200).json({
            response: 200,
            output: result,
            data: result,
            hasAccount: result.hasAccount,
            has_account: result.has_account,
            status: result.status,
            message: result.hasAccount ? "Akun sudah terdaftar" : "Akun belum terdaftar"
        });
    } catch (err) {
        console.log(`[Error Check Account Status]:`, err);
        return res.status(500).json({ pesan: "error mas di controller checkAccountStatusController: " + err });
    }
}

import { getAccessLogs } from "../models/accessLogs.js"

export async function getAccessLogsController(req, res) {
    const limit = req.query.limit || 100
    console.log(`[Request Get Access Logs] limit: ${limit}`)
    try {
        const logs = await getAccessLogs(limit)
        return responseSucces(200, logs, "Riwayat log akses keamanan berhasil diambil masbro", res)
    } catch (err) {
        console.log(`[Error Get Access Logs]:`, err)
        return res.status(500).json({ pesan: "error mas di controller getAccessLogsController: " + err })
    }
}

