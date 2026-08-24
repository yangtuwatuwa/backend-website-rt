import {
    createNotificationModel,
    createNotificationBatchModel,
    getNotificationsByAccountId,
    getUnreadNotificationCount,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    getAccountIdsByFamilyId,
    getAccountIdsByFamilyIds
} from "../models/notificationModel.js";
import { emitSyncEvent } from "../utils/socket.js";

/**
 * Reusable Helper: Buat dan kirim notifikasi in-app
 * Bisa dikirim ke accountId spesifik ATAU ke seluruh akun dalam familyId
 */
export async function createNotification({
    accountId = null,
    account_id = null,
    familyId = null,
    family_id = null,
    type,
    title,
    message,
    referenceType = null,
    reference_type = null,
    referenceId = null,
    reference_id = null,
    isRead = false,
    connection = null
}) {
    const targetAccountId = accountId || account_id;
    const targetFamilyId = familyId || family_id;
    const targetRefType = referenceType || reference_type;
    const targetRefId = referenceId || reference_id;

    if (!type || !title || !message) {
        console.error("Gagal membuat notifikasi: type, title, dan message wajib diisi!");
        return { error: "type, title, and message are required" };
    }

    try {
        let insertedCount = 0;

        if (targetAccountId) {
            // Kirim ke single account
            await createNotificationModel({
                accountId: Number(targetAccountId),
                type: String(type),
                title: String(title),
                message: String(message),
                referenceType: targetRefType,
                referenceId: targetRefId ? Number(targetRefId) : null,
                isRead: Boolean(isRead)
            }, connection);
            insertedCount = 1;
        } else if (targetFamilyId) {
            // Kirim ke seluruh akun yang terikat ke family_id
            const accountIds = await getAccountIdsByFamilyId(Number(targetFamilyId), connection);
            if (accountIds.length > 0) {
                const notifs = accountIds.map(accId => ({
                    accountId: accId,
                    type: String(type),
                    title: String(title),
                    message: String(message),
                    referenceType: targetRefType,
                    referenceId: targetRefId ? Number(targetRefId) : null,
                    isRead: false
                }));
                await createNotificationBatchModel(notifs, connection);
                insertedCount = notifs.length;
            }
        }

        // Trigger realtime socket sync event agar badge notifikasi frontend ter-update
        try {
            emitSyncEvent("notification");
        } catch (sockErr) {
            // Non-blocking socket error
        }

        return { success: true, count: insertedCount };
    } catch (err) {
        console.error("error createNotification helper:", err);
        return { error: err.message };
    }
}

/**
 * Reusable Helper: Buat notifikasi broadcast ke banyak keluarga sekaligus (misal saat publish tagihan)
 */
export async function createBroadcastFamilyNotifications({
    familyIds = [],
    type,
    title,
    message,
    referenceType = null,
    referenceId = null,
    connection = null
}) {
    if (!Array.isArray(familyIds) || familyIds.length === 0) return { count: 0 };

    try {
        const familyAccounts = await getAccountIdsByFamilyIds(familyIds, connection);
        if (familyAccounts.length === 0) return { count: 0 };

        const notifs = familyAccounts.map(fa => ({
            accountId: fa.id,
            type: String(type),
            title: String(title),
            message: String(message),
            referenceType,
            referenceId: referenceId ? Number(referenceId) : null,
            isRead: false
        }));

        const result = await createNotificationBatchModel(notifs, connection);

        try {
            emitSyncEvent("notification");
        } catch (e) {}

        return { success: true, count: notifs.length, affectedRows: result.affectedRows };
    } catch (err) {
        console.error("error createBroadcastFamilyNotifications:", err);
        return { error: err.message };
    }
}

/**
 * Ambil daftar notifikasi akun sendiri
 */
export async function getMyNotificationsService(accountId, { is_read, isRead, type, limit = 20, page = 1 } = {}) {
    try {
        const cleanLimit = Math.max(1, Math.min(100, Number(limit) || 20));
        const cleanPage = Math.max(1, Number(page) || 1);
        const offset = (cleanPage - 1) * cleanLimit;

        const targetRead = is_read !== undefined ? is_read : isRead;
        const list = await getNotificationsByAccountId(Number(accountId), {
            isRead: targetRead,
            type,
            limit: cleanLimit,
            offset
        });

        const unreadCount = await getUnreadNotificationCount(Number(accountId));

        return {
            page: cleanPage,
            limit: cleanLimit,
            unread_count: unreadCount,
            total_items: list.length,
            notifications: list
        };
    } catch (err) {
        console.error("error getMyNotificationsService:", err);
        return { error: "Gagal mengambil daftar notifikasi: " + err.message };
    }
}

/**
 * Ambil jumlah notifikasi yang belum dibaca
 */
export async function getUnreadNotificationCountService(accountId) {
    try {
        const count = await getUnreadNotificationCount(Number(accountId));
        return { unread_count: count };
    } catch (err) {
        console.error("error getUnreadNotificationCountService:", err);
        return { error: "Gagal mengambil jumlah notifikasi: " + err.message };
    }
}

/**
 * Tandai satu notifikasi sebagai telah dibaca
 */
export async function markNotificationReadService(notificationId, accountId) {
    try {
        const result = await markNotificationAsRead(Number(notificationId), Number(accountId));
        if (result.affectedRows === 0) {
            return { error: "Notifikasi tidak ditemukan atau bukan milik akun Anda!" };
        }

        const unreadCount = await getUnreadNotificationCount(Number(accountId));
        return {
            message: "Notifikasi berhasil ditandai telah dibaca",
            notification_id: Number(notificationId),
            is_read: true,
            unread_count: unreadCount
        };
    } catch (err) {
        console.error("error markNotificationReadService:", err);
        return { error: "Gagal memperbarui status notifikasi: " + err.message };
    }
}

/**
 * Tandai semua notifikasi akun sebagai telah dibaca
 */
export async function markAllNotificationsReadService(accountId) {
    try {
        const result = await markAllNotificationsAsRead(Number(accountId));
        return {
            message: `Semua (${result.affectedRows}) notifikasi berhasil ditandai telah dibaca`,
            affected_rows: result.affectedRows,
            unread_count: 0
        };
    } catch (err) {
        console.error("error markAllNotificationsReadService:", err);
        return { error: "Gagal memperbarui notifikasi: " + err.message };
    }
}
