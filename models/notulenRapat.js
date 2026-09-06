import db from "../config/sqlconfig.js";

export async function inputNotulenRapat(tanggalRapat, topik, hasilKeputusan, executor = db) {
    const [result] = await executor.execute(
        `INSERT INTO notulen_rapat (tanggal_rapat, topik, hasil_keputusan)
         VALUES (?, ?, ?)`,
        [tanggalRapat, topik, hasilKeputusan],
    );
    return result;
}

function buildDateFilter(filters = {}) {
    const conditions = [];
    const params = [];
    if (filters.dateFrom) {
        conditions.push("tanggal_rapat >= ?");
        params.push(filters.dateFrom);
    }
    if (filters.dateTo) {
        conditions.push("tanggal_rapat <= ?");
        params.push(filters.dateTo);
    }
    return {
        where: conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "",
        params,
    };
}

export async function getNotulenRapat(filters, executor = db) {
    const { where, params } = buildDateFilter(filters);
    const [rows] = await executor.execute(
        `SELECT id, DATE_FORMAT(tanggal_rapat, '%Y-%m-%d') AS tanggal_rapat,
                topik, hasil_keputusan, created_at, updated_at
         FROM notulen_rapat${where}
         ORDER BY tanggal_rapat DESC, id DESC
         LIMIT ? OFFSET ?`,
        [...params, String(filters.limit), String(filters.offset)],
    );
    return rows;
}

export async function countNotulenRapat(filters, executor = db) {
    const { where, params } = buildDateFilter(filters);
    const [rows] = await executor.execute(
        `SELECT COUNT(*) AS total FROM notulen_rapat${where}`,
        params,
    );
    return Number(rows[0]?.total || 0);
}

export async function getNotulenRapatById(id, executor = db) {
    const [rows] = await executor.execute(
        `SELECT id, DATE_FORMAT(tanggal_rapat, '%Y-%m-%d') AS tanggal_rapat,
                topik, hasil_keputusan, created_at, updated_at
         FROM notulen_rapat
         WHERE id = ?
         LIMIT 1`,
        [id],
    );
    return rows[0] || null;
}

export async function updateNotulenRapat(id, tanggalRapat, topik, hasilKeputusan, executor = db) {
    const [result] = await executor.execute(
        `UPDATE notulen_rapat
         SET tanggal_rapat = ?, topik = ?, hasil_keputusan = ?
         WHERE id = ?`,
        [tanggalRapat, topik, hasilKeputusan, id],
    );
    return result;
}

export async function deleteNotulenRapat(id, executor = db) {
    const [result] = await executor.execute(
        "DELETE FROM notulen_rapat WHERE id = ?",
        [id],
    );
    return result;
}
