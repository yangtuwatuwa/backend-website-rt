import {
    getMyNotificationsService,
    getUnreadNotificationCountService,
    markNotificationReadService,
    markAllNotificationsReadService
} from "../services/notificationService.js";
import { responseSucces } from "../utils/response.js";

/**
 * Mengambil daftar notifikasi in-app milik akun yang sedang login
 * Route: GET /account/notifications (dan GET /resident/notifications)
 */
export async function getMyNotificationsController(req, res) {
    const userId = req.user.id;
    const { page, limit, is_read, isRead, type } = req.query;

    try {
        const result = await getMyNotificationsService(userId, {
            page,
            limit,
            is_read: is_read !== undefined ? is_read : isRead,
            type
        });

        if (result.error) {
            return res.status(400).json({ pesan: result.error });
        }

        return responseSucces(200, result, "Daftar notifikasi berhasil diambil", res);
    } catch (err) {
        console.error("[Controller Error getMyNotifications]:", err);
        return res.status(500).json({ pesan: "Error di controller getMyNotifications: " + err.message });
    }
}

/**
 * Mengambil jumlah notifikasi belum dibaca (unread count)
 * Route: GET /account/notifications/unread-count
 */
export async function getUnreadNotificationCountController(req, res) {
    const userId = req.user.id;

    try {
        const result = await getUnreadNotificationCountService(userId);

        if (result.error) {
            return res.status(400).json({ pesan: result.error });
        }

        return responseSucces(200, result, "Jumlah notifikasi belum dibaca berhasil diambil", res);
    } catch (err) {
        console.error("[Controller Error getUnreadNotificationCount]:", err);
        return res.status(500).json({ pesan: "Error di controller getUnreadNotificationCount: " + err.message });
    }
}

/**
 * Menandai satu notifikasi tertentu sebagai telah dibaca
 * Route: PATCH /account/notifications/:id/read
 */
export async function markNotificationReadController(req, res) {
    const userId = req.user.id;
    const { id } = req.params;

    if (!id || isNaN(Number(id))) {
        return res.status(400).json({ pesan: "ID notifikasi tidak valid!" });
    }

    try {
        const result = await markNotificationReadService(id, userId);

        if (result.error) {
            return res.status(404).json({ pesan: result.error });
        }

        return responseSucces(200, result, result.message, res);
    } catch (err) {
        console.error("[Controller Error markNotificationRead]:", err);
        return res.status(500).json({ pesan: "Error di controller markNotificationRead: " + err.message });
    }
}

/**
 * Menandai seluruh notifikasi akun sebagai telah dibaca
 * Route: PATCH /account/notifications/read-all
 */
export async function markAllNotificationsReadController(req, res) {
    const userId = req.user.id;

    try {
        const result = await markAllNotificationsReadService(userId);

        if (result.error) {
            return res.status(400).json({ pesan: result.error });
        }

        return responseSucces(200, result, result.message, res);
    } catch (err) {
        console.error("[Controller Error markAllNotificationsRead]:", err);
        return res.status(500).json({ pesan: "Error di controller markAllNotificationsRead: " + err.message });
    }
}
