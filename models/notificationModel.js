import db from "../config/sqlconfig.js";

let tableInitialized = false;

export async function ensureNotificationTable() {
    if (!tableInitialized) {
        try {
            await db.execute(`
                CREATE TABLE IF NOT EXISTS notifications (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    account_id INT NOT NULL,
                    type VARCHAR(50) NOT NULL,
                    title VARCHAR(255) NOT NULL,
                    message TEXT NOT NULL,
                    reference_type VARCHAR(50) NULL,
                    reference_id INT NULL,
                    is_read BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_notif_account_id (account_id),
                    INDEX idx_notif_is_read (is_read),
                    INDEX idx_notif_created_at (created_at),
                    INDEX idx_notif_type (type),
                    CONSTRAINT fk_notifications_account FOREIGN KEY (account_id) REFERENCES acount(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            `);
            tableInitialized = true;
        } catch (e) {
            console.error("Auto-init notifications table error:", e.message);
        }
    }
}

/**
 * Simpan 1 notifikasi baru ke database
 */
export async function createNotificationModel({
    accountId,
    type,
    title,
    message,
    referenceType = null,
    referenceId = null,
    isRead = false
}, connection = null) {
    await ensureNotificationTable();
    const client = connection || db;
    const sql = `
        INSERT INTO notifications (
            account_id, type, title, message, reference_type, reference_id, is_read, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
    `;
    try {
        const [result] = await client.execute(sql, [
            accountId,
            type,
            title,
            message,
            referenceType,
            referenceId,
            isRead ? 1 : 0
        ]);
        return result;
    } catch (err) {
        console.error("error createNotificationModel:", err);
        throw err;
    }
}

/**
 * Simpan batch banyak notifikasi sekaligus (misal saat publish tagihan ke banyak keluarga)
 */
export async function createNotificationBatchModel(notifList, connection = null) {
    await ensureNotificationTable();
    if (!Array.isArray(notifList) || notifList.length === 0) return { affectedRows: 0 };
    const client = connection || db;

    const values = [];
    const placeholders = notifList.map(n => {
        values.push(
            n.accountId,
            n.type,
            n.title,
            n.message,
            n.referenceType || null,
            n.referenceId || null,
            n.isRead ? 1 : 0
        );
        return "(?, ?, ?, ?, ?, ?, ?, NOW())";
    }).join(", ");

    const sql = `
        INSERT INTO notifications (
            account_id, type, title, message, reference_type, reference_id, is_read, created_at
        ) VALUES ${placeholders}
    `;

    try {
        const [result] = await client.execute(sql, values);
        return result;
    } catch (err) {
        console.error("error createNotificationBatchModel:", err);
        throw err;
    }
}

/**
 * Ambil daftar notifikasi untuk sebuah akun (dengan filter & pagination)
 */
export async function getNotificationsByAccountId(accountId, { isRead, type, limit = 20, offset = 0 } = {}) {
    await ensureNotificationTable();
    let sql = "SELECT * FROM notifications WHERE account_id = ?";
    const params = [accountId];

    if (isRead !== undefined && isRead !== null && isRead !== "all") {
        const boolVal = (isRead === true || isRead === "true" || isRead === 1 || isRead === "1");
        sql += " AND is_read = ?";
        params.push(boolVal ? 1 : 0);
    }

    if (type && type.trim()) {
        sql += " AND type = ?";
        params.push(type.trim());
    }

    sql += " ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?";
    params.push(String(limit), String(offset));

    try {
        const [rows] = await db.execute(sql, params);
        return rows.map(r => ({
            ...r,
            is_read: Boolean(r.is_read)
        }));
    } catch (err) {
        console.error("error getNotificationsByAccountId:", err);
        throw err;
    }
}

/**
 * Hitung jumlah notifikasi belum dibaca (unread count)
 */
export async function getUnreadNotificationCount(accountId) {
    await ensureNotificationTable();
    const sql = "SELECT COUNT(id) AS unread_count FROM notifications WHERE account_id = ? AND is_read = 0";
    try {
        const [rows] = await db.execute(sql, [accountId]);
        return Number(rows[0]?.unread_count || 0);
    } catch (err) {
        console.error("error getUnreadNotificationCount:", err);
        throw err;
    }
}

/**
 * Tandai satu notifikasi sebagai telah dibaca
 */
export async function markNotificationAsRead(notificationId, accountId) {
    await ensureNotificationTable();
    const sql = "UPDATE notifications SET is_read = 1 WHERE id = ? AND account_id = ?";
    try {
        const [result] = await db.execute(sql, [notificationId, accountId]);
        return result;
    } catch (err) {
        console.error("error markNotificationAsRead:", err);
        throw err;
    }
}

/**
 * Tandai semua notifikasi akun sebagai telah dibaca
 */
export async function markAllNotificationsAsRead(accountId) {
    await ensureNotificationTable();
    const sql = "UPDATE notifications SET is_read = 1 WHERE account_id = ? AND is_read = 0";
    try {
        const [result] = await db.execute(sql, [accountId]);
        return result;
    } catch (err) {
        console.error("error markAllNotificationsAsRead:", err);
        throw err;
    }
}

/**
 * Cari seluruh account_id yang terikat pada sebuah Kartu Keluarga (family_id)
 */
export async function getAccountIdsByFamilyId(familyId, connection = null) {
    const client = connection || db;
    const sql = "SELECT id FROM acount WHERE family_id = ?";
    try {
        const [rows] = await client.execute(sql, [familyId]);
        return rows.map(r => r.id);
    } catch (err) {
        console.error("error getAccountIdsByFamilyId:", err);
        return [];
    }
}

/**
 * Cari seluruh account_id milik keluarga-keluarga tertentu (batch)
 */
export async function getAccountIdsByFamilyIds(familyIds, connection = null) {
    if (!Array.isArray(familyIds) || familyIds.length === 0) return [];
    const client = connection || db;
    const placeholders = familyIds.map(() => "?").join(", ");
    const sql = `SELECT id, family_id FROM acount WHERE family_id IN (${placeholders})`;
    try {
        const [rows] = await client.execute(sql, familyIds);
        return rows;
    } catch (err) {
        console.error("error getAccountIdsByFamilyIds:", err);
        return [];
    }
}
