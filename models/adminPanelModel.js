import pool from "../config/sqlconfig.js";

/**
 * Cek apakah username sudah digunakan di tabel acount.
 * @param {string} username 
 * @returns {Promise<boolean>}
 */
export async function checkUsernameExists(username, executor = pool) {
    const client = executor || pool;
    const sql = "SELECT id FROM acount WHERE username = ?";
    try {
        const [rows] = await client.execute(sql, [username]);
        return rows.length > 0;
    } catch (err) {
        console.error("error checkUsernameExists in adminPanelModel:", err);
        throw err;
    }
}

/**
 * Hapus akun RT dari tabel acount (Hard delete role 'rt').
 * @param {number} id 
 * @returns {Promise<object>}
 */
export async function deleteRtAccount(id, executor = pool) {
    const client = executor || pool;
    const sql = "DELETE FROM acount WHERE id = ? AND role = 'rt'";
    try {
        const [result] = await client.execute(sql, [id]);
        return result;
    } catch (err) {
        console.error("error deleteRtAccount in adminPanelModel:", err);
        throw err;
    }
}

/**
 * Insert akun RT baru ke tabel acount.
 * @param {object} param0 
 * @returns {Promise<object>}
 */
export async function createRtAccount(data, executor = pool) {
    const client = executor || pool;
    const { username, password, emailEncrypted, emailBlindIdx } = data;
    const sql = "INSERT INTO acount (username, password, role, email_encrypted, email_blind_idx, must_change_password) VALUES (?, ?, 'rt', ?, ?, 1)";
    try {
        const [result] = await client.execute(sql, [username, password, emailEncrypted, emailBlindIdx]);
        return result;
    } catch (err) {
        if (err && (err.code === 'ER_DUP_ENTRY' || err.errno === 1062)) {
            throw new Error("Username atau email sudah terdaftar");
        }
        console.error("error createRtAccount in adminPanelModel:", err);
        throw err;
    }
}

/**
 * Ambil daftar akun staff (sekertaris / bendahara) berdasarkan role filter.
 * @param {string} roleFilter 
 * @returns {Promise<Array>}
 */
export async function getStaffAccounts(roleFilter, executor = pool) {
    const client = executor || pool;
    const sql = "SELECT id, username, role, family_id, must_change_password, created_at, updated_at FROM acount WHERE role = ? ORDER BY created_at DESC";
    try {
        const [rows] = await client.execute(sql, [roleFilter]);
        return rows;
    } catch (err) {
        console.error("error getStaffAccounts in adminPanelModel:", err);
        throw err;
    }
}

/**
 * Hapus akun staff (sekertaris / bendahara) dari tabel acount.
 * @param {number} id 
 * @returns {Promise<object>}
 */
export async function deleteStaffAccount(id, executor = pool) {
    const client = executor || pool;
    const sql = "DELETE FROM acount WHERE id = ? AND role IN ('sekertaris', 'bendahara')";
    try {
        const [result] = await client.execute(sql, [id]);
        return result;
    } catch (err) {
        console.error("error deleteStaffAccount in adminPanelModel:", err);
        throw err;
    }
}

/**
 * Ambil daftar audit logs dengan LEFT JOIN ke acount, filter dinamis, dan pagination.
 * @param {object} param0 
 * @returns {Promise<Array>}
 */
export async function getAuditLogs(filters, executor = pool) {
    const client = executor || pool;
    const { role, dateFrom, dateTo, limit, offset } = filters;
    const conditions = [];
    const params = [];

    if (role) {
        conditions.push("a.role = ?");
        params.push(role);
    }
    if (dateFrom) {
        conditions.push("l.created_at >= ?");
        params.push(`${dateFrom} 00:00:00`);
    }
    if (dateTo) {
        conditions.push("l.created_at <= ?");
        params.push(`${dateTo} 23:59:59`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const sql = `
        SELECT 
            l.id,
            l.username,
            a.role,
            l.event_type,
            l.status,
            l.details,
            l.created_at
        FROM access_logs l
        LEFT JOIN acount a ON l.username = a.username
        ${whereClause}
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT ? OFFSET ?
    `;

    params.push(String(limit), String(offset));

    try {
        const [rows] = await client.execute(sql, params);
        return rows;
    } catch (err) {
        console.error("error getAuditLogs in adminPanelModel:", err);
        throw err;
    }
}

/**
 * Hitung total baris audit logs dengan filter yang sama.
 * @param {object} param0 
 * @returns {Promise<number>}
 */
export async function countAuditLogs(filters, executor = pool) {
    const client = executor || pool;
    const { role, dateFrom, dateTo } = filters;
    const conditions = [];
    const params = [];

    if (role) {
        conditions.push("a.role = ?");
        params.push(role);
    }
    if (dateFrom) {
        conditions.push("l.created_at >= ?");
        params.push(`${dateFrom} 00:00:00`);
    }
    if (dateTo) {
        conditions.push("l.created_at <= ?");
        params.push(`${dateTo} 23:59:59`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const sql = `
        SELECT COUNT(*) AS total
        FROM access_logs l
        LEFT JOIN acount a ON l.username = a.username
        ${whereClause}
    `;

    try {
        const [rows] = await client.execute(sql, params);
        return rows[0]?.total || 0;
    } catch (err) {
        console.error("error countAuditLogs in adminPanelModel:", err);
        throw err;
    }
}
