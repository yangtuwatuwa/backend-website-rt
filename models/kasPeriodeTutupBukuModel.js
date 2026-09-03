import db from "../config/sqlconfig.js";

const closingColumns = `kp.*, DATE_FORMAT(kp.periode_mulai, '%Y-%m-%d') AS periode_mulai,
    DATE_FORMAT(kp.periode_selesai, '%Y-%m-%d') AS periode_selesai`;

export async function lockKasBuku(executor) {
    const [rows] = await executor.execute("SELECT id FROM kas_buku_lock WHERE id = 1 FOR UPDATE");
    if (rows.length !== 1) throw new Error("Lock buku kas belum tersedia. Jalankan migrasi tutup buku.");
}

export async function findLatestKasClosing(executor = db, { forUpdate = false } = {}) {
    const [rows] = await executor.execute(
        `SELECT ${closingColumns} FROM kas_periode_tutup_buku kp
         WHERE kp.deleted_at IS NULL ORDER BY kp.periode_selesai DESC, kp.id DESC LIMIT 1${forUpdate ? " FOR UPDATE" : ""}`,
    );
    return rows[0] ?? null;
}

export async function findKasClosingById(id, executor = db) {
    const [rows] = await executor.execute(
        `SELECT ${closingColumns} FROM kas_periode_tutup_buku kp WHERE kp.id = ? AND kp.deleted_at IS NULL`, [id],
    );
    return rows[0] ?? null;
}

export async function insertKasClosing(data, executor) {
    const [result] = await executor.execute(
        `INSERT INTO kas_periode_tutup_buku
         (periode_mulai, periode_selesai, saldo_awal, total_pemasukan, total_pengeluaran,
          saldo_akhir, jumlah_transaksi, ditutup_oleh, ditutup_role, keterangan, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [data.periode_mulai, data.periode_selesai, data.saldo_awal, data.total_pemasukan,
            data.total_pengeluaran, data.saldo_akhir, data.jumlah_transaksi, data.actorId,
            data.actorRole, data.keterangan, data.actorId, data.actorId],
    );
    return result;
}

export async function listKasClosings({ limit, offset }, executor = db) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 200 || !Number.isInteger(offset) || offset < 0) {
        throw new TypeError("Pagination tutup buku tidak valid.");
    }
    const [rows] = await executor.execute(
        `SELECT ${closingColumns} FROM kas_periode_tutup_buku kp
         WHERE kp.deleted_at IS NULL ORDER BY kp.periode_selesai DESC, kp.id DESC LIMIT ${limit} OFFSET ${offset}`,
    );
    const [[count]] = await executor.execute("SELECT COUNT(*) AS total FROM kas_periode_tutup_buku WHERE deleted_at IS NULL");
    return { rows, total: Number(count.total) };
}
