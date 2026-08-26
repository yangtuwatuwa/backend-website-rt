import {
    checkUsernameExists,
    deleteRtAccount,
    createRtAccount,
    getStaffAccounts,
    deleteStaffAccount,
    getAuditLogs,
    countAuditLogs
} from "../models/adminPanelModel.js";
import { getAccountById, getAccountByIdWithAuth } from "../models/login.js";
import { findAccountByBlindIndex } from "../models/register.js";
import { argonhash, argonverify } from "../helpers/argon2.js";
import { normalizeEmail, computeBlindIndex, encryptEmail } from "../lib/crypto/email.js";
import { createAccessLog } from "../models/accessLogs.js";
import { toSafeUser, toSafeUsers } from "../helpers/sanitizeUser.js";

/**
 * Format tanggal ke ISO 8601 dengan timezone Asia/Jakarta (+07:00 / WIB).
 * @param {Date|string} date 
 * @returns {string|null}
 */
function formatIsoWib(date) {
    if (!date) return null;
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return String(date);

    const wibMs = d.getTime() + 7 * 60 * 60 * 1000;
    const wibDate = new Date(wibMs);
    const y = wibDate.getUTCFullYear();
    const m = String(wibDate.getUTCMonth() + 1).padStart(2, "0");
    const day = String(wibDate.getUTCDate()).padStart(2, "0");
    const h = String(wibDate.getUTCHours()).padStart(2, "0");
    const min = String(wibDate.getUTCMinutes()).padStart(2, "0");
    const s = String(wibDate.getUTCSeconds()).padStart(2, "0");
    return `${y}-${m}-${day}T${h}:${min}:${s}+07:00`;
}

/**
 * Validasi string tanggal format YYYY-MM-DD.
 * @param {string} dateStr 
 * @returns {boolean}
 */
function isValidDateString(dateStr) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return (
        date.getUTCFullYear() === y &&
        date.getUTCMonth() === m - 1 &&
        date.getUTCDate() === d
    );
}

/**
 * Service untuk menghapus akun RT (hard delete) dengan re-autentikasi password admin.
 * @param {number} targetId 
 * @param {number} actorUserId 
 * @param {string} adminPassword 
 * @param {string} ipAddress 
 * @param {string} userAgent 
 * @returns {Promise<object>}
 */
export async function deleteRtAccountService(targetId, actorUserId, adminPassword, ipAddress = "127.0.0.1", userAgent = "unknown") {
    // 1. Ambil data admin login dengan password hash untuk re-auth
    if (!actorUserId) {
        return { status: 401, error: "Identitas admin tidak valid" };
    }
    const adminUserRows = await getAccountByIdWithAuth(actorUserId);
    if (!adminUserRows || adminUserRows.length === 0) {
        return { status: 401, error: "Akun admin tidak ditemukan" };
    }
    const adminUser = adminUserRows[0];

    // 2. Verifikasi password admin yang sedang login
    const isPasswordValid = await argonverify(adminUser.password, adminPassword);
    if (!isPasswordValid) {
        return { status: 401, error: "Password admin salah" };
    }

    // 3. Ambil data target akun RT sebelum dihapus untuk pencatatan log
    const targetRows = await getAccountById(targetId);
    if (!targetRows || targetRows.length === 0 || targetRows[0].role !== "rt") {
        return { status: 404, error: "Akun RT tidak ditemukan" };
    }
    const targetUser = targetRows[0];

    // 4. Eksekusi hard delete akun RT
    const result = await deleteRtAccount(targetId);
    if (!result || result.affectedRows === 0) {
        return { status: 404, error: "Akun RT tidak ditemukan" };
    }

    // 5. Tulis riwayat ke access_logs
    await createAccessLog(
        adminUser.username,
        "DELETE_RT_ACCOUNT",
        ipAddress,
        userAgent,
        "success",
        `Menghapus akun RT: id=${targetId}, username=${targetUser.username}`
    );

    return { status: 200, message: "Akun RT berhasil dihapus" };
}

/**
 * Service untuk membuat akun RT baru.
 * @param {object} param0 
 * @param {number} actorUserId 
 * @param {string} ipAddress 
 * @param {string} userAgent 
 * @returns {Promise<object>}
 */
export async function createRtAccountService({ username, password, email }, actorUserId, ipAddress = "127.0.0.1", userAgent = "unknown") {
    // 1. Validasi identitas admin actor secara ketat (tanpa fallback generic)
    if (!actorUserId) {
        return { status: 401, error: "Identitas admin tidak valid" };
    }
    const adminRows = await getAccountById(actorUserId);
    if (!adminRows || adminRows.length === 0) {
        return { status: 401, error: "Akun admin tidak ditemukan" };
    }
    const adminUsername = adminRows[0].username;

    const cleanUsername = String(username).trim();
    const rawPassword = String(password).trim();
    const normalized = normalizeEmail(email);

    if (!normalized) {
        return { status: 400, error: "Format email tidak valid" };
    }

    // 2. Pre-check duplikasi username
    const isUsernameTaken = await checkUsernameExists(cleanUsername);
    if (isUsernameTaken) {
        return { status: 409, error: "Username sudah digunakan oleh akun lain" };
    }

    // 3. Pre-check duplikasi email via blind index
    const blindIdx = computeBlindIndex(normalized);
    const isEmailTaken = await findAccountByBlindIndex(blindIdx);
    if (isEmailTaken) {
        return { status: 409, error: "Email sudah terdaftar pada akun lain" };
    }

    // 4. Hash password dan enkripsi email
    const passwordHash = await argonhash(rawPassword);
    const encryptedEmail = encryptEmail(normalized);

    // 5. Simpan ke database (role='rt', must_change_password=1)
    const result = await createRtAccount({
        username: cleanUsername,
        password: passwordHash,
        emailEncrypted: encryptedEmail,
        emailBlindIdx: blindIdx
    });

    const newAccountId = result.insertId;

    // 6. Tulis log audit dengan username admin yang valid
    await createAccessLog(
        adminUsername,
        "CREATE_RT_ROLE",
        ipAddress,
        userAgent,
        "success",
        `Membuat akun RT baru: id=${newAccountId}, username=${cleanUsername}`
    );

    // 7. Sanitasi objek akun baru untuk response
    const safeUser = toSafeUser({
        id: newAccountId,
        username: cleanUsername,
        role: "rt",
        family_id: null,
        must_change_password: 1
    });

    return {
        status: 201,
        message: "Akun RT berhasil dibuat",
        data: safeUser
    };
}

/**
 * Service untuk mengambil daftar akun staff (sekertaris / bendahara).
 * @param {string|undefined} roleQuery 
 * @returns {Promise<object>}
 */
export async function getStaffAccountsService(roleQuery) {
    // WAJIBKAN role, tolak kalau kosong / tidak ada
    if (!roleQuery || !String(roleQuery).trim()) {
        return {
            status: 400,
            error: "Query parameter 'role' wajib diisi (sekertaris atau bendahara)"
        };
    }

    const cleanRole = String(roleQuery).trim().toLowerCase();
    const mappedRole = cleanRole === "sekretaris" ? "sekertaris" : cleanRole;

    if (mappedRole !== "sekertaris" && mappedRole !== "bendahara") {
        return {
            status: 400,
            error: "Filter role tidak valid masbro! Pilihan hanya boleh 'sekertaris' atau 'bendahara'."
        };
    }

    const rows = await getStaffAccounts(mappedRole);
    const sanitized = toSafeUsers(rows, ["created_at", "updated_at"]);

    return {
        status: 200,
        data: sanitized
    };
}

/**
 * Service untuk menghapus akun staff (sekertaris / bendahara) dengan re-autentikasi password admin.
 * @param {number} targetId 
 * @param {number} actorUserId 
 * @param {string} adminPassword 
 * @param {string} ipAddress 
 * @param {string} userAgent 
 * @returns {Promise<object>}
 */
export async function deleteStaffAccountService(targetId, actorUserId, adminPassword, ipAddress = "127.0.0.1", userAgent = "unknown") {
    // 1. Ambil data admin login dengan password hash untuk re-auth
    if (!actorUserId) {
        return { status: 401, error: "Identitas admin tidak valid" };
    }
    const adminUserRows = await getAccountByIdWithAuth(actorUserId);
    if (!adminUserRows || adminUserRows.length === 0) {
        return { status: 401, error: "Akun admin tidak ditemukan" };
    }
    const adminUser = adminUserRows[0];

    // 2. Verifikasi password admin yang sedang login
    const isPasswordValid = await argonverify(adminUser.password, adminPassword);
    if (!isPasswordValid) {
        return { status: 401, error: "Password admin salah" };
    }

    // 3. Ambil data target akun staff sebelum dihapus
    const targetRows = await getAccountById(targetId);
    if (!targetRows || targetRows.length === 0) {
        return { status: 404, error: "Akun staff tidak ditemukan" };
    }
    const targetUser = targetRows[0];
    if (targetUser.role !== "sekertaris" && targetUser.role !== "bendahara") {
        return { status: 404, error: "Akun staff tidak ditemukan atau bukan akun pengurus staff" };
    }

    // 4. Eksekusi hard delete akun staff
    const result = await deleteStaffAccount(targetId);
    if (!result || result.affectedRows === 0) {
        return { status: 404, error: "Akun staff tidak ditemukan" };
    }

    // 5. Tulis riwayat ke access_logs
    await createAccessLog(
        adminUser.username,
        "DELETE_STAFF_ACCOUNT",
        ipAddress,
        userAgent,
        "success",
        `Menghapus akun staff: id=${targetId}, username=${targetUser.username}, role=${targetUser.role}`
    );

    return { status: 200, message: "Akun staff berhasil dihapus" };
}

/**
 * Service untuk membaca audit logs dengan filter role, date_from, date_to, dan pagination.
 * @param {object} param0 
 * @returns {Promise<object>}
 */
export async function getAuditLogsService({ role, date_from, date_to, page, limit }) {
    let roleFilter = null;

    // 1. Validasi filter role (opsional)
    if (role && String(role).trim()) {
        const cleanRole = String(role).trim().toLowerCase();
        const mappedRole = cleanRole === "sekretaris" ? "sekertaris" : cleanRole;
        const allowedRoles = ["rt", "sekertaris", "bendahara", "admin"];

        if (!allowedRoles.includes(mappedRole)) {
            return {
                status: 400,
                error: "Filter role tidak valid. Hanya boleh 'rt', 'sekertaris', 'bendahara', atau 'admin'."
            };
        }
        roleFilter = mappedRole;
    }

    // 2. Validasi filter date_from (opsional)
    let dateFromFilter = null;
    if (date_from && String(date_from).trim()) {
        const cleanDateFrom = String(date_from).trim();
        if (!isValidDateString(cleanDateFrom)) {
            return {
                status: 400,
                error: "Format date_from tidak valid (gunakan format YYYY-MM-DD)"
            };
        }
        dateFromFilter = cleanDateFrom;
    }

    // 3. Validasi filter date_to (opsional)
    let dateToFilter = null;
    if (date_to && String(date_to).trim()) {
        const cleanDateTo = String(date_to).trim();
        if (!isValidDateString(cleanDateTo)) {
            return {
                status: 400,
                error: "Format date_to tidak valid (gunakan format YYYY-MM-DD)"
            };
        }
        dateToFilter = cleanDateTo;
    }

    // 4. Validasi rentang tanggal jika keduanya diisi
    if (dateFromFilter && dateToFilter && dateFromFilter > dateToFilter) {
        return {
            status: 400,
            error: "date_from tidak boleh lebih besar dari date_to"
        };
    }

    // 5. Normalisasi pagination (page default 1, limit default 20, max clamp 100)
    const pageNum = parseInt(page, 10);
    const validPage = (!isNaN(pageNum) && pageNum > 0) ? pageNum : 1;

    const limitNum = parseInt(limit, 10);
    const parsedLimit = (!isNaN(limitNum) && limitNum > 0) ? limitNum : 20;
    const validLimit = Math.min(parsedLimit, 100);

    const offset = (validPage - 1) * validLimit;

    // 6. Query data dan count total
    const [rows, totalCount] = await Promise.all([
        getAuditLogs({
            role: roleFilter,
            dateFrom: dateFromFilter,
            dateTo: dateToFilter,
            limit: validLimit,
            offset
        }),
        countAuditLogs({
            role: roleFilter,
            dateFrom: dateFromFilter,
            dateTo: dateToFilter
        })
    ]);

    // 7. Format output setiap row (tanpa mengekspos ip_address & user_agent)
    const formattedLogs = rows.map(row => ({
        id: row.id,
        username: row.username || null,
        role: row.role || null,
        event_type: row.event_type || null,
        status: row.status || null,
        details: row.details || null,
        created_at: formatIsoWib(row.created_at)
    }));

    const totalPages = Math.ceil(totalCount / validLimit) || 1;

    return {
        status: 200,
        data: formattedLogs,
        pagination: {
            page: validPage,
            limit: validLimit,
            total_data: totalCount,
            total_pages: totalPages
        },
        message: "Data audit log berhasil diambil"
    };
}
