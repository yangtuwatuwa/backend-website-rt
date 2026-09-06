import {
    countNotulenRapat,
    deleteNotulenRapat,
    getNotulenRapat,
    getNotulenRapatById,
    inputNotulenRapat,
    updateNotulenRapat,
} from "../models/notulenRapat.js";

export class NotulenRapatError extends Error {
    constructor(status, code, message, details = {}) {
        super(message);
        this.name = "NotulenRapatError";
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

function positiveId(value) {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) {
        throw new NotulenRapatError(400, "INVALID_ID", "ID notulen rapat tidak valid.");
    }
    return id;
}

function requiredText(value, field) {
    if (typeof value !== "string" || !value.trim()) {
        throw new NotulenRapatError(400, "REQUIRED_FIELD", `${field} wajib diisi.`);
    }
    const text = value.trim();
    if (text.length > 200) {
        throw new NotulenRapatError(400, "FIELD_TOO_LONG", `${field} maksimal 200 karakter.`);
    }
    return text;
}

function validDate(value, field = "tanggal_rapat") {
    if (typeof value !== "string") {
        throw new NotulenRapatError(400, "INVALID_DATE", `${field} wajib berformat YYYY-MM-DD.`);
    }
    const text = value.trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (!match) {
        throw new NotulenRapatError(400, "INVALID_DATE", `${field} wajib berformat YYYY-MM-DD.`);
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
        year < 1000
        || parsed.getUTCFullYear() !== year
        || parsed.getUTCMonth() + 1 !== month
        || parsed.getUTCDate() !== day
    ) {
        throw new NotulenRapatError(400, "INVALID_DATE", `${field} bukan tanggal kalender yang valid.`);
    }
    return text;
}

function optionalDate(value, field) {
    return value === undefined || value === null || String(value).trim() === ""
        ? null
        : validDate(value, field);
}

function normalizeFilters(input = {}) {
    const dateFrom = optionalDate(input.date_from ?? input.dateFrom, "date_from");
    const dateTo = optionalDate(input.date_to ?? input.dateTo, "date_to");
    if (dateFrom && dateTo && dateFrom > dateTo) {
        throw new NotulenRapatError(400, "INVALID_DATE_RANGE", "date_from tidak boleh setelah date_to.");
    }
    const page = Number(input.page ?? 1);
    const limit = Number(input.limit ?? 20);
    if (!Number.isInteger(page) || page <= 0 || !Number.isInteger(limit) || limit <= 0 || limit > 100) {
        throw new NotulenRapatError(400, "INVALID_PAGINATION", "page harus positif dan limit harus 1-100.");
    }
    return { dateFrom, dateTo, page, limit, offset: (page - 1) * limit };
}

export async function addNotulenRapat(tanggalRapat, topik, hasilKeputusan, executor = undefined) {
    const tanggal = validDate(tanggalRapat);
    const cleanTopik = requiredText(topik, "topik");
    const cleanHasil = requiredText(hasilKeputusan, "hasil_keputusan");
    const result = await inputNotulenRapat(tanggal, cleanTopik, cleanHasil, executor);
    return getNotulenRapatById(result.insertId, executor);
}

export async function listAllNotulenRapat(query = {}, executor = undefined) {
    const filters = normalizeFilters(query);
    const [items, total] = await Promise.all([
        getNotulenRapat(filters, executor),
        countNotulenRapat(filters, executor),
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

export async function getNotulenRapatDetail(idInput, executor = undefined) {
    const id = positiveId(idInput);
    const existing = await getNotulenRapatById(id, executor);
    if (!existing) {
        throw new NotulenRapatError(404, "NOTULEN_NOT_FOUND", "Notulen rapat tidak ditemukan.");
    }
    return existing;
}

export async function editNotulenRapat(idInput, updates = {}, executor = undefined) {
    const id = positiveId(idInput);
    const supplied = ["tanggal_rapat", "topik", "hasil_keputusan"]
        .some((field) => updates[field] !== undefined);
    if (!supplied) {
        throw new NotulenRapatError(400, "EMPTY_UPDATE", "Tidak ada field notulen rapat yang diperbarui.");
    }

    const existing = await getNotulenRapatById(id, executor);
    if (!existing) {
        throw new NotulenRapatError(404, "NOTULEN_NOT_FOUND", "Notulen rapat tidak ditemukan.");
    }

    const tanggal = updates.tanggal_rapat !== undefined
        ? validDate(updates.tanggal_rapat)
        : formatDateOnly(existing.tanggal_rapat);
    const topik = updates.topik !== undefined
        ? requiredText(updates.topik, "topik")
        : existing.topik;
    const hasilKeputusan = updates.hasil_keputusan !== undefined
        ? requiredText(updates.hasil_keputusan, "hasil_keputusan")
        : existing.hasil_keputusan;

    await updateNotulenRapat(id, tanggal, topik, hasilKeputusan, executor);
    return getNotulenRapatById(id, executor);
}

function formatDateOnly(value) {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
}

export async function removeNotulenRapat(idInput, executor = undefined) {
    const id = positiveId(idInput);
    const existing = await getNotulenRapatById(id, executor);
    if (!existing) {
        throw new NotulenRapatError(404, "NOTULEN_NOT_FOUND", "Notulen rapat tidak ditemukan.");
    }
    await deleteNotulenRapat(id, executor);
    return { id, deleted: true };
}
