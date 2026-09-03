import db from "../config/sqlconfig.js";

function buildWhere(filters = {}, alias = "kt") {
    const clauses = [`${alias}.deleted_at IS NULL`];
    const params = [];

    if (filters.keyword) {
        clauses.push(`(${alias}.deskripsi LIKE ? OR ${alias}.kategori_kas LIKE ?)`);
        const pattern = `%${filters.keyword}%`;
        params.push(pattern, pattern);
    }
    if (filters.tipeMutasi) {
        clauses.push(`${alias}.tipe_mutasi = ?`);
        params.push(filters.tipeMutasi);
    }
    if (filters.kategoriKas) {
        clauses.push(`${alias}.kategori_kas = ?`);
        params.push(filters.kategoriKas);
    }
    if (filters.tanggalMulai) {
        clauses.push(`${alias}.tanggal >= ?`);
        params.push(filters.tanggalMulai);
    }
    if (filters.tanggalSelesai) {
        clauses.push(`${alias}.tanggal <= ?`);
        params.push(filters.tanggalSelesai);
    }
    return { sql: clauses.join(" AND "), params };
}

export async function insertKasTransaksi(data, executor = db) {
    const [result] = await executor.execute(
        `INSERT INTO kas_transaksi
            (tanggal, deskripsi, kategori_kas, tipe_mutasi, nominal, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [data.tanggal, data.deskripsi, data.kategoriKas, data.tipeMutasi, data.nominal, data.actorId, data.actorId],
    );
    return result;
}

export async function findKasTransaksiById(id, executor = db, { forUpdate = false } = {}) {
    if (forUpdate) {
        const [lockedRows] = await executor.execute(
            `SELECT * FROM kas_transaksi WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
            [id],
        );
        return lockedRows[0] ?? null;
    }
    const [rows] = await executor.execute(
        `SELECT kt.*, creator.username AS created_by_username, updater.username AS updated_by_username
         FROM kas_transaksi kt
         LEFT JOIN acount creator ON creator.id = kt.created_by
         LEFT JOIN acount updater ON updater.id = kt.updated_by
         WHERE kt.id = ? AND kt.deleted_at IS NULL`,
        [id],
    );
    return rows[0] ?? null;
}

export async function updateKasTransaksiRow(id, data, executor = db) {
    const fields = [];
    const params = [];
    const mapping = {
        tanggal: "tanggal",
        deskripsi: "deskripsi",
        kategoriKas: "kategori_kas",
        tipeMutasi: "tipe_mutasi",
        nominal: "nominal",
    };

    for (const [key, column] of Object.entries(mapping)) {
        if (data[key] !== undefined) {
            fields.push(`${column} = ?`);
            params.push(data[key]);
        }
    }
    fields.push("updated_by = ?");
    params.push(data.actorId, id);

    const [result] = await executor.execute(
        `UPDATE kas_transaksi SET ${fields.join(", ")} WHERE id = ? AND deleted_at IS NULL`,
        params,
    );
    return result;
}

export async function softDeleteKasTransaksiRow(id, actorId, executor = db) {
    const [result] = await executor.execute(
        `UPDATE kas_transaksi
         SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ?, updated_by = ?
         WHERE id = ? AND deleted_at IS NULL`,
        [actorId, actorId, id],
    );
    return result;
}

export async function listKasTransaksiRows(filters = {}, executor = db, options = {}) {
    const where = buildWhere(filters);
    const paginate = options.paginate !== false;
    // Sebagian server MySQL/MariaDB menolak placeholder LIMIT/OFFSET pada
    // prepared statement (ER_WRONG_ARGUMENTS). Nilai ini aman di-inline karena
    // service sudah memvalidasinya sebagai integer dalam rentang yang ketat.
    const limit = Number(filters.limit);
    const offset = Number(filters.offset);
    if (paginate && (
        !Number.isInteger(limit) || limit < 1 || limit > 200 ||
        !Number.isInteger(offset) || offset < 0
    )) {
        throw new TypeError("Pagination kas_transaksi tidak valid.");
    }
    const limitClause = paginate
        ? ` LIMIT ${limit} OFFSET ${offset}`
        : " LIMIT 10000";
    const params = [...where.params];

    const [rows] = await executor.execute(
        `SELECT kt.*, creator.username AS created_by_username, updater.username AS updated_by_username
         FROM kas_transaksi kt
         LEFT JOIN acount creator ON creator.id = kt.created_by
         LEFT JOIN acount updater ON updater.id = kt.updated_by
         WHERE ${where.sql}
         ORDER BY kt.tanggal DESC, kt.id DESC${limitClause}`,
        params,
    );
    return rows;
}

export async function countKasTransaksiRows(filters = {}, executor = db) {
    const where = buildWhere(filters);
    const [rows] = await executor.execute(
        `SELECT COUNT(*) AS total FROM kas_transaksi kt WHERE ${where.sql}`,
        where.params,
    );
    return Number(rows[0].total);
}

export async function summarizeKasTransaksiRows(filters = {}, executor = db, options = {}) {
    const where = buildWhere(filters);
    // All summaries share the same movement calculation. A single statement keeps
    // the opening balance and movements in one consistent database read.
    let openingSql = "SELECT CAST(? AS DECIMAL(20, 2)) AS saldo_awal";
    let openingParams = [options.saldoAwal ?? 0];
    let boundarySql = "";
    if (options.currentPeriod) {
        openingSql = `SELECT COALESCE(kp.saldo_akhir, 0) AS saldo_awal, kp.periode_selesai
            FROM (SELECT 1) seed LEFT JOIN kas_periode_tutup_buku kp ON kp.id = (
                SELECT id FROM kas_periode_tutup_buku WHERE deleted_at IS NULL
                ORDER BY periode_selesai DESC, id DESC LIMIT 1)`;
        openingParams = [];
        boundarySql = " AND (opening.periode_selesai IS NULL OR kt.tanggal > opening.periode_selesai)";
    } else if (options.includeOpeningBalance && filters.tanggalMulai) {
        const prior = buildWhere({ ...filters, tanggalMulai: null, tanggalSelesai: null }, "prior");
        openingSql = `SELECT COALESCE(SUM(CASE WHEN prior.tipe_mutasi = 'masuk'
            THEN prior.nominal ELSE -prior.nominal END), 0) AS saldo_awal
            FROM kas_transaksi prior WHERE ${prior.sql} AND prior.tanggal < ?`;
        openingParams = [...prior.params, filters.tanggalMulai];
    }
    // Category/search/type filters represent movement subtotals, not total cash.
    const openingExpression = options.movementsOnly ? "0" : "COALESCE(MAX(opening.saldo_awal), 0)";
    const [rows] = await executor.execute(
        `SELECT COUNT(kt.id) AS jumlah_transaksi,
            ${openingExpression} AS saldo_awal,
            COALESCE(SUM(CASE WHEN kt.tipe_mutasi = 'masuk' THEN kt.nominal ELSE 0 END), 0) AS total_pemasukan,
            COALESCE(SUM(CASE WHEN kt.tipe_mutasi = 'keluar' THEN kt.nominal ELSE 0 END), 0) AS total_pengeluaran,
            ${openingExpression} + COALESCE(SUM(CASE WHEN kt.tipe_mutasi = 'masuk' THEN kt.nominal ELSE -kt.nominal END), 0) AS saldo_akhir
         FROM (${openingSql}) opening LEFT JOIN kas_transaksi kt ON ${where.sql}${boundarySql}${options.forUpdate ? " FOR UPDATE" : ""}`,
        [...openingParams, ...where.params],
    );
    return rows[0];
}

export async function findFirstKasTransactionDate(cutoff, executor = db) {
    const [rows] = await executor.execute(
        `SELECT DATE_FORMAT(tanggal, '%Y-%m-%d') AS tanggal FROM kas_transaksi
         WHERE deleted_at IS NULL AND tanggal <= ? ORDER BY tanggal, id LIMIT 1 FOR UPDATE`, [cutoff],
    );
    return rows[0]?.tanggal ?? null;
}

export async function getKasMonthlyRollup(year, filters = {}, executor = db) {
    const where = buildWhere({
        ...filters,
        tanggalMulai: `${year}-01-01`,
        tanggalSelesai: `${year}-12-31`,
    });
    const [rows] = await executor.execute(
        `SELECT MONTH(kt.tanggal) AS bulan, COUNT(*) AS jumlah_transaksi,
            COALESCE(SUM(CASE WHEN kt.tipe_mutasi = 'masuk' THEN kt.nominal ELSE 0 END), 0) AS total_pemasukan,
            COALESCE(SUM(CASE WHEN kt.tipe_mutasi = 'keluar' THEN kt.nominal ELSE 0 END), 0) AS total_pengeluaran,
            COALESCE(SUM(CASE WHEN kt.tipe_mutasi = 'masuk' THEN kt.nominal ELSE -kt.nominal END), 0) AS saldo
         FROM kas_transaksi kt WHERE ${where.sql}
         GROUP BY MONTH(kt.tanggal) ORDER BY bulan ASC`,
        where.params,
    );
    return rows;
}

export async function getKasCategoryRollup(filters = {}, executor = db) {
    const where = buildWhere(filters);
    const [rows] = await executor.execute(
        `SELECT kt.kategori_kas, COUNT(*) AS jumlah_transaksi,
            COALESCE(SUM(CASE WHEN kt.tipe_mutasi = 'masuk' THEN kt.nominal ELSE 0 END), 0) AS total_pemasukan,
            COALESCE(SUM(CASE WHEN kt.tipe_mutasi = 'keluar' THEN kt.nominal ELSE 0 END), 0) AS total_pengeluaran,
            COALESCE(SUM(CASE WHEN kt.tipe_mutasi = 'masuk' THEN kt.nominal ELSE -kt.nominal END), 0) AS saldo
         FROM kas_transaksi kt WHERE ${where.sql}
         GROUP BY kt.kategori_kas ORDER BY kt.kategori_kas ASC`,
        where.params,
    );
    return rows;
}
