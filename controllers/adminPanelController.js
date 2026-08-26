import {
    deleteRtAccountService,
    createRtAccountService,
    getStaffAccountsService,
    deleteStaffAccountService,
    getAuditLogsService
} from "../services/adminPanelService.js";

/**
 * Controller untuk menghapus akun RT (DELETE /api/admin/positions/rt/:id).
 */
export async function deleteRtAccountController(req, res) {
    const { id } = req.params;
    const { admin_password } = req.body;
    const actorUserId = req.user?.id;
    const ipAddress = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1";
    const userAgent = req.headers["user-agent"] || "unknown";

    console.log(`[Request Delete RT Account] targetId: ${id}, actorUserId: ${actorUserId}`);

    if (!id || isNaN(Number(id))) {
        return res.status(400).json({ pesan: "ID akun RT tidak valid" });
    }

    if (!admin_password || !String(admin_password).trim()) {
        return res.status(400).json({ pesan: "Password admin wajib diisi untuk re-autentikasi" });
    }

    try {
        const result = await deleteRtAccountService(
            Number(id),
            actorUserId,
            String(admin_password).trim(),
            ipAddress,
            userAgent
        );

        if (result.error) {
            return res.status(result.status || 400).json({ pesan: result.error });
        }

        return res.status(200).json({
            response: 200,
            pesan: result.message,
            message: result.message
        });
    } catch (err) {
        console.error("[Error Delete RT Account Controller]:", err);
        return res.status(500).json({ pesan: "Terjadi kesalahan pada server: " + (err.message || err) });
    }
}

/**
 * Controller untuk membuat akun RT baru (POST /api/admin/positions/rt).
 */
export async function createRtAccountController(req, res) {
    const { username, password, email } = req.body;
    const actorUserId = req.user?.id;
    const ipAddress = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1";
    const userAgent = req.headers["user-agent"] || "unknown";

    console.log(`[Request Create RT Account] username: ${username}, email: ${email}, actorUserId: ${actorUserId}`);

    if (!username || !String(username).trim()) {
        return res.status(400).json({ pesan: "Username wajib diisi" });
    }
    if (!password || !String(password).trim()) {
        return res.status(400).json({ pesan: "Password wajib diisi" });
    }
    if (!email || !String(email).trim()) {
        return res.status(400).json({ pesan: "Email wajib diisi" });
    }

    try {
        const result = await createRtAccountService(
            {
                username: String(username).trim(),
                password: String(password).trim(),
                email: String(email).trim()
            },
            actorUserId,
            ipAddress,
            userAgent
        );

        if (result.error) {
            return res.status(result.status || 400).json({ pesan: result.error });
        }

        return res.status(201).json({
            response: 201,
            data: result.data,
            message: result.message
        });
    } catch (err) {
        console.error("[Error Create RT Account Controller]:", err);
        return res.status(500).json({ pesan: "Terjadi kesalahan pada server: " + (err.message || err) });
    }
}

/**
 * Controller untuk list akun bendahara/sekretaris (GET /api/admin/accounts?role=sekertaris|bendahara).
 */
export async function getStaffAccountsController(req, res) {
    const { role } = req.query;
    console.log(`[Request Get Staff Accounts] role: ${role || "all_staff"}`);

    try {
        const result = await getStaffAccountsService(role);

        if (result.error) {
            return res.status(result.status || 400).json({ pesan: result.error });
        }

        return res.status(200).json({
            response: 200,
            data: result.data,
            message: "Daftar akun staff berhasil diambil"
        });
    } catch (err) {
        console.error("[Error Get Staff Accounts Controller]:", err);
        return res.status(500).json({ pesan: "Terjadi kesalahan pada server: " + (err.message || err) });
    }
}

/**
 * Controller untuk hapus akun bendahara/sekretaris (DELETE /api/admin/accounts/:id).
 */
export async function deleteStaffAccountController(req, res) {
    const { id } = req.params;
    const { admin_password } = req.body;
    const actorUserId = req.user?.id;
    const ipAddress = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1";
    const userAgent = req.headers["user-agent"] || "unknown";

    console.log(`[Request Delete Staff Account] targetId: ${id}, actorUserId: ${actorUserId}`);

    if (!id || isNaN(Number(id))) {
        return res.status(400).json({ pesan: "ID akun staff tidak valid" });
    }

    if (!admin_password || !String(admin_password).trim()) {
        return res.status(400).json({ pesan: "Password admin wajib diisi untuk re-autentikasi" });
    }

    try {
        const result = await deleteStaffAccountService(
            Number(id),
            actorUserId,
            String(admin_password).trim(),
            ipAddress,
            userAgent
        );

        if (result.error) {
            return res.status(result.status || 400).json({ pesan: result.error });
        }

        return res.status(200).json({
            response: 200,
            pesan: result.message,
            message: result.message
        });
    } catch (err) {
        console.error("[Error Delete Staff Account Controller]:", err);
        return res.status(500).json({ pesan: "Terjadi kesalahan pada server: " + (err.message || err) });
    }
}

/**
 * Controller untuk membaca audit logs (GET /api/admin/audit-logs?role=&date_from=&date_to=&page=&limit=).
 */
export async function getAuditLogsController(req, res) {
    const { role, date_from, date_to, page, limit } = req.query;
    console.log(`[Request Get Audit Logs] role: ${role || "all"}, date_from: ${date_from || "none"}, date_to: ${date_to || "none"}, page: ${page || 1}, limit: ${limit || 20}`);

    try {
        const result = await getAuditLogsService({ role, date_from, date_to, page, limit });

        if (result.error) {
            return res.status(result.status || 400).json({ pesan: result.error });
        }

        return res.status(200).json({
            response: 200,
            data: result.data,
            pagination: result.pagination,
            message: result.message
        });
    } catch (err) {
        console.error("[Error Get Audit Logs Controller]:", err);
        return res.status(500).json({ pesan: "Terjadi kesalahan pada server: " + (err.message || err) });
    }
}
