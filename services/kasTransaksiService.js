import pool from "../config/sqlconfig.js";
import {
    countKasTransaksiRows,
    findKasTransaksiById,
    getKasCategoryRollup,
    getKasMonthlyRollup,
    insertKasTransaksi,
    listKasTransaksiRows,
    softDeleteKasTransaksiRow,
    summarizeKasTransaksiRows,
    updateKasTransaksiRow,
} from "../models/kasTransaksiModel.js";

let savepointCounter = 0;

export const SUGGESTED_KAS_CATEGORIES = Object.freeze([
    "keamanan",
    "kebersihan",
    "ATK",
    "kegiatan",
    "iuran bulanan",
    "donasi",
    "subsidi",
]);

export class KasTransaksiError extends Error {
    constructor(status, code, message, details = {}) {
        super(message);
        this.name = "KasTransaksiError";
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

function assertPositiveId(value, label = "ID transaksi") {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) {
        throw new KasTransaksiError(400, "INVALID_ID", `${label} tidak valid.`);
    }
    return id;
}

function normalizeDate(value, field = "tanggal") {
    const text = String(value ?? "").trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (!match) {
        throw new KasTransaksiError(400, "INVALID_DATE", `${field} wajib berformat YYYY-MM-DD.`);
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) {
        throw new KasTransaksiError(400, "INVALID_DATE", `${field} bukan tanggal kalender yang valid.`);
    }
    return text;
}

function normalizeText(value, field, maxLength) {
    const text = String(value ?? "").trim();
    if (!text) {
        throw new KasTransaksiError(400, "REQUIRED_FIELD", `${field} wajib diisi.`);
    }
    if (text.length > maxLength) {
        throw new KasTransaksiError(400, "FIELD_TOO_LONG", `${field} maksimal ${maxLength} karakter.`);
    }
    return text;
}

function normalizeNominal(value) {
    const nominal = Number(value);
    if (!Number.isFinite(nominal) || nominal <= 0) {
        throw new KasTransaksiError(400, "INVALID_NOMINAL", "nominal wajib berupa angka positif.");
    }
    if (nominal > 9999999999999.99) {
        throw new KasTransaksiError(400, "INVALID_NOMINAL", "nominal melebihi batas penyimpanan.");
    }
    return Math.round((nominal + Number.EPSILON) * 100) / 100;
}

function normalizeMutationType(value) {
    const type = String(value ?? "").toLowerCase().trim();
    if (!['masuk', 'keluar'].includes(type)) {
        throw new KasTransaksiError(400, "INVALID_MUTATION_TYPE", "tipe_mutasi harus 'masuk' atau 'keluar'.");
    }
    return type;
}

function normalizeActor(actor = {}) {
    const actorId = assertPositiveId(actor.actorId ?? actor.id, "ID pengguna");
    return {
        actorId,
        actorUsername: String(actor.actorUsername ?? actor.username ?? `account:${actorId}`).trim(),
        actorRole: String(actor.actorRole ?? actor.role ?? "unknown").trim(),
        ipAddress: String(actor.ipAddress ?? "-").trim(),
        userAgent: String(actor.userAgent ?? "-").trim(),
    };
}

function normalizeCreateInput(input, forcedType) {
    return {
        tanggal: normalizeDate(input.tanggal),
        deskripsi: normalizeText(input.deskripsi, "deskripsi", 2000),
        kategoriKas: normalizeText(input.kategoriKas ?? input.kategori_kas ?? input.kategori, "kategori_kas", 100),
        tipeMutasi: normalizeMutationType(forcedType ?? input.tipeMutasi ?? input.tipe_mutasi),
        nominal: normalizeNominal(input.nominal),
    };
}

function normalizeUpdateInput(input) {
    const data = {};
    if (input.tanggal !== undefined) data.tanggal = normalizeDate(input.tanggal);
    if (input.deskripsi !== undefined) data.deskripsi = normalizeText(input.deskripsi, "deskripsi", 2000);
    const category = input.kategoriKas ?? input.kategori_kas ?? input.kategori;
    if (category !== undefined) data.kategoriKas = normalizeText(category, "kategori_kas", 100);
    const type = input.tipeMutasi ?? input.tipe_mutasi;
    if (type !== undefined) data.tipeMutasi = normalizeMutationType(type);
    if (input.nominal !== undefined) data.nominal = normalizeNominal(input.nominal);
    if (Object.keys(data).length === 0) {
        throw new KasTransaksiError(400, "EMPTY_UPDATE", "Tidak ada field transaksi yang diperbarui.");
    }
    return data;
}

function optionalDate(value, field) {
    return value === undefined || value === null || String(value).trim() === ""
        ? null
        : normalizeDate(value, field);
}

export function normalizeKasFilters(input = {}, { paginate = true } = {}) {
    const tipeRaw = input.tipeMutasi ?? input.tipe_mutasi ?? input.tipe;
    const tipeMutasi = tipeRaw && String(tipeRaw).toLowerCase() !== "semua"
        ? normalizeMutationType(tipeRaw)
        : null;
    const tanggalMulai = optionalDate(input.tanggalMulai ?? input.tanggal_mulai ?? input.date_from, "tanggal_mulai");
    const tanggalSelesai = optionalDate(input.tanggalSelesai ?? input.tanggal_selesai ?? input.date_to, "tanggal_selesai");
    if (tanggalMulai && tanggalSelesai && tanggalMulai > tanggalSelesai) {
        throw new KasTransaksiError(400, "INVALID_DATE_RANGE", "tanggal_mulai tidak boleh setelah tanggal_selesai.");
    }

    const filters = {
        keyword: String(input.keyword ?? input.search ?? input.q ?? "").trim().slice(0, 200) || null,
        tipeMutasi,
        kategoriKas: String(input.kategoriKas ?? input.kategori_kas ?? input.kategori ?? "").trim().slice(0, 100) || null,
        tanggalMulai,
        tanggalSelesai,
    };

    if (paginate) {
        const page = Number(input.page ?? 1);
        const limit = Number(input.limit ?? 25);
        if (!Number.isInteger(page) || page <= 0 || !Number.isInteger(limit) || limit <= 0 || limit > 200) {
            throw new KasTransaksiError(400, "INVALID_PAGINATION", "page harus positif dan limit harus 1-200.");
        }
        filters.page = page;
        filters.limit = limit;
        filters.offset = (page - 1) * limit;
    }
    return filters;
}

function normalizeRow(row) {
    if (!row) return row;
    return { ...row, nominal: Number(row.nominal) };
}

function normalizeSummary(row) {
    return {
        jumlah_transaksi: Number(row.jumlah_transaksi),
        total_pemasukan: Number(row.total_pemasukan),
        total_pengeluaran: Number(row.total_pengeluaran),
        saldo_akhir: Number(row.saldo_akhir),
    };
}

async function writeAudit(connection, eventType, actor, transactionId, before, after) {
    const details = JSON.stringify({
        actor_id: actor.actorId,
        actor_role: actor.actorRole,
        kas_transaksi_id: transactionId,
        before,
        after,
        timestamp: new Date().toISOString(),
    });
    await connection.execute(
        `INSERT INTO access_logs (username, event_type, ip_address, user_agent, status, details)
         VALUES (?, ?, ?, ?, 'success', ?)`,
        [actor.actorUsername, eventType, actor.ipAddress, actor.userAgent, details],
    );
}

async function runMutation(prefix, executor, operation) {
    const ownsTransaction = !executor;
    const connection = executor || await pool.getConnection();
    const savepointName = ownsTransaction ? null : `sp_${prefix}_${++savepointCounter}`;
    let transactionStarted = false;
    let savepointCreated = false;

    try {
        if (ownsTransaction) {
            await connection.beginTransaction();
            transactionStarted = true;
        } else {
            await connection.query(`SAVEPOINT ${savepointName}`);
            savepointCreated = true;
        }

        const result = await operation(connection);
        if (ownsTransaction) {
            await connection.commit();
            transactionStarted = false;
        } else {
            await connection.query(`RELEASE SAVEPOINT ${savepointName}`);
            savepointCreated = false;
        }
        return result;
    } catch (error) {
        if (transactionStarted) {
            try { await connection.rollback(); } catch (rollbackError) {
                console.error(`[KasTransaksi] rollback ${prefix} gagal:`, rollbackError);
            }
        } else if (savepointCreated) {
            try { await connection.query(`ROLLBACK TO SAVEPOINT ${savepointName}`); } catch (rollbackError) {
                console.error(`[KasTransaksi] rollback savepoint ${prefix} gagal:`, rollbackError);
            }
            try { await connection.query(`RELEASE SAVEPOINT ${savepointName}`); } catch (releaseError) {
                console.error(`[KasTransaksi] release savepoint ${prefix} gagal:`, releaseError);
            }
        }
        throw error;
    } finally {
        if (ownsTransaction) connection.release();
    }
}

export async function createKasTransaksiService(input, actor, executor = undefined, forcedType = undefined) {
    const data = normalizeCreateInput(input, forcedType);
    const cleanActor = normalizeActor(actor);
    return runMutation("kas_create", executor, async (connection) => {
        const result = await insertKasTransaksi({ ...data, actorId: cleanActor.actorId }, connection);
        const created = await findKasTransaksiById(result.insertId, connection);
        await writeAudit(connection, "KAS_TRANSAKSI_CREATE", cleanActor, result.insertId, null, normalizeRow(created));
        return normalizeRow(created);
    });
}

export function catatPemasukanKasService(input, actor, executor = undefined) {
    return createKasTransaksiService(input, actor, executor, "masuk");
}

export function catatPengeluaranKasService(input, actor, executor = undefined) {
    return createKasTransaksiService(input, actor, executor, "keluar");
}

export async function updateKasTransaksiService(idValue, input, actor, executor = undefined) {
    const id = assertPositiveId(idValue);
    const data = normalizeUpdateInput(input);
    const cleanActor = normalizeActor(actor);
    return runMutation("kas_update", executor, async (connection) => {
        const before = await findKasTransaksiById(id, connection, { forUpdate: true });
        if (!before) throw new KasTransaksiError(404, "KAS_NOT_FOUND", "Transaksi kas tidak ditemukan atau sudah dihapus.");
        const result = await updateKasTransaksiRow(id, { ...data, actorId: cleanActor.actorId }, connection);
        if (result.affectedRows !== 1) throw new KasTransaksiError(409, "KAS_UPDATE_RACE", "Transaksi berubah saat diperbarui; silakan coba lagi.");
        const updated = await findKasTransaksiById(id, connection);
        await writeAudit(connection, "KAS_TRANSAKSI_UPDATE", cleanActor, id, normalizeRow(before), normalizeRow(updated));
        return normalizeRow(updated);
    });
}

export async function deleteKasTransaksiService(idValue, actor, executor = undefined) {
    const id = assertPositiveId(idValue);
    const cleanActor = normalizeActor(actor);
    return runMutation("kas_delete", executor, async (connection) => {
        const before = await findKasTransaksiById(id, connection, { forUpdate: true });
        if (!before) throw new KasTransaksiError(404, "KAS_NOT_FOUND", "Transaksi kas tidak ditemukan atau sudah dihapus.");
        const result = await softDeleteKasTransaksiRow(id, cleanActor.actorId, connection);
        if (result.affectedRows !== 1) throw new KasTransaksiError(409, "KAS_DELETE_RACE", "Transaksi berubah saat dihapus; silakan coba lagi.");
        await writeAudit(connection, "KAS_TRANSAKSI_DELETE", cleanActor, id, normalizeRow(before), null);
        return { deletedId: id, deletedAt: new Date().toISOString() };
    });
}

export async function getKasTransaksiListService(input = {}, executor = pool) {
    const filters = normalizeKasFilters(input);
    const [rows, total] = await Promise.all([
        listKasTransaksiRows(filters, executor),
        countKasTransaksiRows(filters, executor),
    ]);
    return {
        data: rows.map(normalizeRow),
        pagination: { page: filters.page, limit: filters.limit, total, total_pages: Math.ceil(total / filters.limit) },
        filters: {
            keyword: filters.keyword,
            tipe_mutasi: filters.tipeMutasi ?? "semua",
            kategori_kas: filters.kategoriKas,
            tanggal_mulai: filters.tanggalMulai,
            tanggal_selesai: filters.tanggalSelesai,
        },
    };
}

export async function getKasTransactionsForExportService(input = {}, executor = pool) {
    const filters = normalizeKasFilters(input, { paginate: false });
    return (await listKasTransaksiRows(filters, executor, { paginate: false })).map(normalizeRow);
}

export async function getKasSummaryService(input = {}, executor = pool) {
    const filters = normalizeKasFilters(input, { paginate: false });
    return normalizeSummary(await summarizeKasTransaksiRows(filters, executor));
}

function assertYear(value) {
    const year = Number(value);
    if (!Number.isInteger(year) || year < 2000 || year > 9999) {
        throw new KasTransaksiError(400, "INVALID_YEAR", "tahun tidak valid.");
    }
    return year;
}

export async function getKasMonthlyReportService(input = {}, executor = pool) {
    const year = assertYear(input.tahun ?? input.year ?? new Date().getFullYear());
    const month = Number(input.bulan ?? input.month ?? new Date().getMonth() + 1);
    if (!Number.isInteger(month) || month < 1 || month > 12) {
        throw new KasTransaksiError(400, "INVALID_MONTH", "bulan harus bernilai 1-12.");
    }
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const filters = normalizeKasFilters({
        ...input,
        tanggalMulai: `${year}-${String(month).padStart(2, "0")}-01`,
        tanggalSelesai: `${year}-${String(month).padStart(2, "0")}-${lastDay}`,
    }, { paginate: false });
    const [transactions, summary, categories] = await Promise.all([
        listKasTransaksiRows(filters, executor, { paginate: false }),
        summarizeKasTransaksiRows(filters, executor),
        getKasCategoryRollup(filters, executor),
    ]);
    return {
        periode: { bulan: month, tahun: year },
        summary: normalizeSummary(summary),
        rekap_kategori: categories.map((row) => ({ ...row, jumlah_transaksi: Number(row.jumlah_transaksi), total_pemasukan: Number(row.total_pemasukan), total_pengeluaran: Number(row.total_pengeluaran), saldo: Number(row.saldo) })),
        transactions: transactions.map(normalizeRow),
    };
}

export async function getKasYearlyReportService(input = {}, executor = pool) {
    const year = assertYear(input.tahun ?? input.year ?? new Date().getFullYear());
    const filters = normalizeKasFilters(input, { paginate: false });
    const [rollup, summary] = await Promise.all([
        getKasMonthlyRollup(year, filters, executor),
        summarizeKasTransaksiRows({ ...filters, tanggalMulai: `${year}-01-01`, tanggalSelesai: `${year}-12-31` }, executor),
    ]);
    const byMonth = new Map(rollup.map((row) => [Number(row.bulan), row]));
    const months = Array.from({ length: 12 }, (_, index) => {
        const row = byMonth.get(index + 1) ?? {};
        return {
            bulan: index + 1,
            jumlah_transaksi: Number(row.jumlah_transaksi ?? 0),
            total_pemasukan: Number(row.total_pemasukan ?? 0),
            total_pengeluaran: Number(row.total_pengeluaran ?? 0),
            saldo: Number(row.saldo ?? 0),
        };
    });
    return { tahun: year, summary: normalizeSummary(summary), months };
}

export async function getKasRecapService(input = {}, executor = pool) {
    const periodInput = { ...input };
    const rawYear = input.tahun ?? input.year;
    const rawMonth = input.bulan ?? input.month;
    if (rawYear !== undefined && !input.tanggalMulai && !input.tanggal_mulai && !input.date_from) {
        const year = assertYear(rawYear);
        if (rawMonth !== undefined) {
            const month = Number(rawMonth);
            if (!Number.isInteger(month) || month < 1 || month > 12) {
                throw new KasTransaksiError(400, "INVALID_MONTH", "bulan harus bernilai 1-12.");
            }
            const monthText = String(month).padStart(2, "0");
            const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
            periodInput.tanggalMulai = `${year}-${monthText}-01`;
            periodInput.tanggalSelesai = `${year}-${monthText}-${lastDay}`;
        } else {
            periodInput.tanggalMulai = `${year}-01-01`;
            periodInput.tanggalSelesai = `${year}-12-31`;
        }
    }
    const filters = normalizeKasFilters(periodInput, { paginate: false });
    const [rows, summary] = await Promise.all([
        getKasCategoryRollup(filters, executor),
        summarizeKasTransaksiRows(filters, executor),
    ]);
    return {
        summary: normalizeSummary(summary),
        categories: rows.map((row) => ({ ...row, jumlah_transaksi: Number(row.jumlah_transaksi), total_pemasukan: Number(row.total_pemasukan), total_pengeluaran: Number(row.total_pengeluaran), saldo: Number(row.saldo) })),
    };
}

export function getSuggestedKasCategoriesService() {
    return [...SUGGESTED_KAS_CATEGORIES];
}
