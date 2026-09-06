import pool from "../config/sqlconfig.js";
import { decryptEmails } from "../helpers/ciihper.js";
import {
    countSuratPengajuanRows,
    findAccountFamilyById,
    findActiveSuratKategoriById,
    findSuratApplicantByAccountId,
    findSuratKategoriById,
    findSuratPengajuanById,
    insertSuratKategori,
    insertSuratPengajuan,
    listActiveSuratKategoriRows,
    listSuratPengajuanRows,
    transitionSuratStatus,
    updateSuratArchived,
} from "../models/suratPengajuanModel.js";

let savepointCounter = 0;

const REVIEW_ROLES = new Set(["rt", "sekertaris", "admin", "superadmin"]);
const DECISION_ROLES = new Set(["rt", "sekertaris"]);
const CATEGORY_WRITE_ROLES = new Set(["admin", "superadmin"]);
const STATUSES = new Set(["pending", "disetujui", "ditolak"]);

export class SuratPengajuanError extends Error {
    constructor(status, code, message, details = {}) {
        super(message);
        this.name = "SuratPengajuanError";
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

function positiveId(value, field = "id") {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) {
        throw new SuratPengajuanError(400, "INVALID_ID", `${field} harus berupa bilangan bulat positif.`);
    }
    return id;
}

function requiredText(value, field, maxLength) {
    if (typeof value !== "string" || !value.trim()) {
        throw new SuratPengajuanError(400, "REQUIRED_FIELD", `${field} wajib diisi.`);
    }
    const text = value.trim();
    if (text.length > maxLength) {
        throw new SuratPengajuanError(400, "FIELD_TOO_LONG", `${field} maksimal ${maxLength} karakter.`);
    }
    return text;
}

function dateValue(value, field) {
    const text = String(value ?? "").trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (!match) {
        throw new SuratPengajuanError(422, "INVALID_SNAPSHOT", `${field} warga tidak valid atau belum tersedia.`);
    }
    const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    if (
        parsed.getUTCFullYear() !== Number(match[1])
        || parsed.getUTCMonth() + 1 !== Number(match[2])
        || parsed.getUTCDate() !== Number(match[3])
    ) {
        throw new SuratPengajuanError(422, "INVALID_SNAPSHOT", `${field} warga bukan tanggal kalender yang valid.`);
    }
    return text;
}

function optionalDate(value, field) {
    return value === undefined || value === null || String(value).trim() === ""
        ? null
        : dateValue(value, field);
}

function decryptLegacyOrPlain(value) {
    if (value === null || value === undefined || value === "") return "";
    const text = String(value);
    return decryptEmails(text) || text;
}

function normalizeActor(actor = {}) {
    return {
        id: positiveId(actor.id ?? actor.actorId, "id pengguna"),
        role: String(actor.role ?? actor.actorRole ?? "").trim().toLowerCase(),
    };
}

function assertRole(actor, allowed, message) {
    if (!allowed.has(actor.role)) {
        throw new SuratPengajuanError(403, "FORBIDDEN", message);
    }
}

async function withWriteTransaction(executor, work) {
    const ownsTransaction = !executor;
    const connection = executor || await pool.getConnection();
    const savepoint = ownsTransaction ? null : `sp_surat_pengajuan_${++savepointCounter}`;
    let started = false;
    let savepointCreated = false;

    try {
        if (ownsTransaction) {
            await connection.beginTransaction();
            started = true;
        } else {
            await connection.query(`SAVEPOINT ${savepoint}`);
            savepointCreated = true;
        }

        const result = await work(connection);

        if (ownsTransaction) await connection.commit();
        else await connection.query(`RELEASE SAVEPOINT ${savepoint}`);
        return result;
    } catch (error) {
        if (ownsTransaction && started) await connection.rollback();
        if (!ownsTransaction && savepointCreated) {
            try {
                await connection.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
                await connection.query(`RELEASE SAVEPOINT ${savepoint}`);
            } catch {
                // Preserve the original business/database error.
            }
        }
        throw error;
    } finally {
        if (ownsTransaction) connection.release();
    }
}

function normalizeCreateInput(input = {}) {
    return {
        kategoriId: positiveId(input.kategori_id ?? input.kategoriId, "kategori_id"),
        keperluan: requiredText(input.keperluan, "keperluan", 2000),
        agama: requiredText(input.agama, "agama", 50),
        pekerjaan: requiredText(input.pekerjaan, "pekerjaan", 100),
        kewarganegaraan: requiredText(input.kewarganegaraan, "kewarganegaraan", 50),
    };
}

function normalizeSnapshot(row) {
    const namaLengkap = requiredText(row.nama, "nama kepala keluarga", 150);
    const jenisKelamin = requiredText(row.jenis_kelamin, "jenis kelamin kepala keluarga", 20);
    const noKtp = requiredText(decryptLegacyOrPlain(row.nik), "NIK kepala keluarga", 20);
    const tanggalLahir = dateValue(decryptLegacyOrPlain(row.tgl_lahir), "tanggal lahir kepala keluarga");
    const alamat = requiredText(decryptLegacyOrPlain(row.house_alamat), "alamat keluarga", 65535);
    const rawTempatLahir = decryptLegacyOrPlain(row.tempat_lahir).trim();
    const tempatLahir = rawTempatLahir
        ? requiredText(rawTempatLahir, "tempat lahir kepala keluarga", 100)
        : null;

    return {
        namaLengkap,
        jenisKelamin,
        // Canonical schema repo belum memiliki warga.tempat_lahir. Model mendeteksi
        // kolom itu agar deployment yang sudah memilikinya tetap dapat snapshot;
        // jika belum ada nilainya NULL dan tidak pernah dipercaya dari request body.
        tempatLahir,
        tanggalLahir,
        noKtp,
        alamat,
    };
}

export async function createSuratPengajuanService(input, actorInput, executor = undefined) {
    const data = normalizeCreateInput(input);
    const actor = normalizeActor(actorInput);
    assertRole(actor, new Set(["warga"]), "Hanya warga yang dapat mengajukan surat.");

    return withWriteTransaction(executor, async (connection) => {
        const [applicant, category] = await Promise.all([
            findSuratApplicantByAccountId(actor.id, connection),
            findActiveSuratKategoriById(data.kategoriId, connection),
        ]);

        if (!applicant || applicant.role !== "warga") {
            throw new SuratPengajuanError(404, "ACCOUNT_NOT_FOUND", "Akun warga tidak ditemukan.");
        }
        if (!applicant.family_id) {
            throw new SuratPengajuanError(409, "FAMILY_NOT_LINKED", "Akun warga belum terikat dengan keluarga.");
        }
        if (!applicant.warga_id) {
            throw new SuratPengajuanError(409, "FAMILY_HEAD_NOT_FOUND", "Kepala keluarga aktif belum tersedia untuk dijadikan snapshot surat.");
        }
        if (!category) {
            throw new SuratPengajuanError(400, "CATEGORY_NOT_FOUND", "kategori_id tidak ditemukan atau sedang nonaktif.");
        }

        const snapshot = normalizeSnapshot(applicant);
        const id = await insertSuratPengajuan({
            ...data,
            ...snapshot,
            familyId: Number(applicant.family_id),
        }, connection);
        return findSuratPengajuanById(id, connection);
    });
}

function normalizeFilters(input = {}) {
    const statusRaw = String(input.status ?? "").trim().toLowerCase();
    if (statusRaw && !STATUSES.has(statusRaw)) {
        throw new SuratPengajuanError(400, "INVALID_STATUS", "status harus pending, disetujui, atau ditolak.");
    }
    const kategoriId = input.kategori_id ?? input.kategoriId;
    const familyId = input.family_id ?? input.familyId;
    const dateFrom = optionalDate(input.date_from ?? input.dateFrom, "date_from");
    const dateTo = optionalDate(input.date_to ?? input.dateTo, "date_to");
    if (dateFrom && dateTo && dateFrom > dateTo) {
        throw new SuratPengajuanError(400, "INVALID_DATE_RANGE", "date_from tidak boleh setelah date_to.");
    }
    const page = Number(input.page ?? 1);
    const limit = Number(input.limit ?? 20);
    if (!Number.isInteger(page) || page <= 0 || !Number.isInteger(limit) || limit <= 0 || limit > 100) {
        throw new SuratPengajuanError(400, "INVALID_PAGINATION", "page harus positif dan limit harus 1-100.");
    }

    return {
        status: statusRaw || null,
        kategoriId: kategoriId === undefined || kategoriId === "" ? null : positiveId(kategoriId, "kategori_id"),
        familyId: familyId === undefined || familyId === "" ? null : positiveId(familyId, "family_id"),
        dateFrom,
        dateTo,
        page,
        limit,
        offset: (page - 1) * limit,
    };
}

export async function listSuratPengajuanService(input, actorInput, executor = pool) {
    const actor = normalizeActor(actorInput);
    assertRole(actor, REVIEW_ROLES, "Anda tidak berhak melihat daftar pengajuan surat.");
    const filters = normalizeFilters(input);
    const [items, total] = await Promise.all([
        listSuratPengajuanRows(filters, executor),
        countSuratPengajuanRows(filters, executor),
    ]);
    return {
        items,
        pagination: {
            page: filters.page,
            limit: filters.limit,
            total,
            total_pages: Math.ceil(total / filters.limit),
        },
    };
}

export async function listMySuratPengajuanService(input, actorInput, executor = pool) {
    const actor = normalizeActor(actorInput);
    assertRole(actor, new Set(["warga"]), "Hanya warga yang dapat melihat daftar surat keluarganya.");
    const account = await findAccountFamilyById(actor.id, executor);
    if (!account || account.role !== "warga" || !account.family_id) {
        throw new SuratPengajuanError(409, "FAMILY_NOT_LINKED", "Akun warga belum terikat dengan keluarga.");
    }
    const filters = normalizeFilters({ ...input, family_id: account.family_id });
    const [items, total] = await Promise.all([
        listSuratPengajuanRows(filters, executor),
        countSuratPengajuanRows(filters, executor),
    ]);
    return {
        items,
        pagination: {
            page: filters.page,
            limit: filters.limit,
            total,
            total_pages: Math.ceil(total / filters.limit),
        },
    };
}

export async function getSuratPengajuanDetailService(idInput, actorInput, executor = pool) {
    const id = positiveId(idInput, "id surat");
    const actor = normalizeActor(actorInput);
    const letter = await findSuratPengajuanById(id, executor);
    if (!letter) throw new SuratPengajuanError(404, "LETTER_NOT_FOUND", "Pengajuan surat tidak ditemukan.");

    if (actor.role === "warga") {
        const account = await findAccountFamilyById(actor.id, executor);
        if (!account || account.role !== "warga" || !account.family_id) {
            throw new SuratPengajuanError(403, "LETTER_NOT_OWNED", "Pengajuan surat ini bukan milik keluarga Anda.");
        }
        if (Number(account.family_id) !== Number(letter.family_id)) {
            throw new SuratPengajuanError(403, "LETTER_NOT_OWNED", "Pengajuan surat ini bukan milik keluarga Anda.");
        }
    } else {
        assertRole(actor, REVIEW_ROLES, "Anda tidak berhak melihat detail pengajuan surat.");
    }
    return letter;
}

async function decideSurat(idInput, actorInput, targetStatus, executor) {
    const id = positiveId(idInput, "id surat");
    const actor = normalizeActor(actorInput);
    assertRole(actor, DECISION_ROLES, "Hanya RT atau sekertaris yang dapat memutuskan pengajuan surat.");

    return withWriteTransaction(executor, async (connection) => {
        const result = await transitionSuratStatus(id, targetStatus, actor.id, connection);
        if (result.affectedRows !== 1) {
            const current = await findSuratPengajuanById(id, connection);
            if (!current) throw new SuratPengajuanError(404, "LETTER_NOT_FOUND", "Pengajuan surat tidak ditemukan.");
            throw new SuratPengajuanError(409, "INVALID_STATUS_TRANSITION", `Pengajuan surat berstatus ${current.status}; hanya status pending yang dapat diproses.`);
        }
        return findSuratPengajuanById(id, connection);
    });
}

export function approveSuratPengajuanService(id, actor, executor = undefined) {
    return decideSurat(id, actor, "disetujui", executor);
}

export function rejectSuratPengajuanService(id, actor, executor = undefined) {
    return decideSurat(id, actor, "ditolak", executor);
}

export async function archiveSuratPengajuanService(idInput, isArchived, actorInput, executor = undefined) {
    const id = positiveId(idInput, "id surat");
    const actor = normalizeActor(actorInput);
    assertRole(actor, REVIEW_ROLES, "Anda tidak berhak mengarsipkan pengajuan surat.");
    if (typeof isArchived !== "boolean") {
        throw new SuratPengajuanError(400, "INVALID_ARCHIVE_VALUE", "is_archived harus berupa boolean.");
    }
    return withWriteTransaction(executor, async (connection) => {
        const result = await updateSuratArchived(id, isArchived, connection);
        if (result.affectedRows !== 1) {
            throw new SuratPengajuanError(404, "LETTER_NOT_FOUND", "Pengajuan surat tidak ditemukan.");
        }
        return findSuratPengajuanById(id, connection);
    });
}

export async function listSuratKategoriService(_actor, executor = pool) {
    return listActiveSuratKategoriRows(executor);
}

export async function createSuratKategoriService(input, actorInput, executor = undefined) {
    const actor = normalizeActor(actorInput);
    assertRole(actor, CATEGORY_WRITE_ROLES, "Hanya admin atau superadmin yang dapat menambah kategori surat.");
    const namaKategori = requiredText(input?.nama_kategori ?? input?.namaKategori, "nama_kategori", 150);

    return withWriteTransaction(executor, async (connection) => {
        try {
            const id = await insertSuratKategori(namaKategori, connection);
            return findSuratKategoriById(id, connection);
        } catch (error) {
            if (error?.code === "ER_DUP_ENTRY" || error?.errno === 1062) {
                throw new SuratPengajuanError(409, "CATEGORY_EXISTS", "Nama kategori surat sudah tersedia.");
            }
            throw error;
        }
    });
}
