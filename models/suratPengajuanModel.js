import pool from "../config/sqlconfig.js";

const LETTER_SELECT = `
    SELECT
        l.id,
        l.family_id,
        l.kategori_id,
        k.nama_kategori,
        l.keperluan,
        l.status,
        l.is_archived,
        l.nama_lengkap,
        l.jenis_kelamin,
        l.tempat_lahir,
        l.tanggal_lahir,
        l.no_ktp,
        l.alamat,
        l.agama,
        l.pekerjaan,
        l.kewarganegaraan,
        l.approved_by,
        l.approved_at,
        l.created_at,
        l.updated_at
    FROM letter l
    JOIN surat_kategori k ON k.id = l.kategori_id`;

export async function findSuratApplicantByAccountId(accountId, executor = pool) {
    const [birthplaceColumns] = await executor.execute(
        `SELECT 1
         FROM information_schema.columns
         WHERE table_schema = DATABASE()
           AND table_name = 'warga'
           AND column_name = 'tempat_lahir'
         LIMIT 1`,
    );
    const birthplaceSelect = birthplaceColumns.length > 0
        ? "w.tempat_lahir"
        : "NULL AS tempat_lahir";
    const [rows] = await executor.execute(
        `SELECT
            a.id AS account_id,
            a.role,
            a.family_id,
            f.kepala_keluarga_id,
            w.id AS warga_id,
            w.nama,
            w.jenis_kelamin,
            ${birthplaceSelect},
            w.tgl_lahir,
            w.nik,
            h.alamat AS house_alamat
         FROM acount a
         LEFT JOIN family f ON f.id = a.family_id
         LEFT JOIN warga w
            ON w.id = f.kepala_keluarga_id
            AND w.family_id = f.id
            AND w.status_data = 'diterima'
         LEFT JOIN house h ON h.id = f.house_id
         WHERE a.id = ?
         LIMIT 1`,
        [accountId],
    );
    return rows[0] || null;
}

export async function findActiveSuratKategoriById(kategoriId, executor = pool) {
    const [rows] = await executor.execute(
        `SELECT id, nama_kategori, is_active, sort_order, created_at
         FROM surat_kategori
         WHERE id = ? AND is_active = 1
         LIMIT 1`,
        [kategoriId],
    );
    return rows[0] || null;
}

export async function insertSuratPengajuan(data, executor = pool) {
    const [result] = await executor.execute(
        `INSERT INTO letter (
            family_id, kategori_id, keperluan, status, is_archived,
            nama_lengkap, jenis_kelamin, tempat_lahir, tanggal_lahir,
            no_ktp, alamat, agama, pekerjaan, kewarganegaraan
         ) VALUES (?, ?, ?, 'pending', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            data.familyId,
            data.kategoriId,
            data.keperluan,
            data.namaLengkap,
            data.jenisKelamin,
            data.tempatLahir,
            data.tanggalLahir,
            data.noKtp,
            data.alamat,
            data.agama,
            data.pekerjaan,
            data.kewarganegaraan,
        ],
    );
    return result.insertId;
}

export async function findSuratPengajuanById(id, executor = pool) {
    const [rows] = await executor.execute(
        `${LETTER_SELECT}
         WHERE l.id = ?
         LIMIT 1`,
        [id],
    );
    return rows[0] || null;
}

function buildListWhere(filters) {
    const clauses = [];
    const params = [];

    if (filters.status) {
        clauses.push("l.status = ?");
        params.push(filters.status);
    }
    if (filters.kategoriId) {
        clauses.push("l.kategori_id = ?");
        params.push(filters.kategoriId);
    }
    if (filters.familyId) {
        clauses.push("l.family_id = ?");
        params.push(filters.familyId);
    }
    if (filters.dateFrom) {
        clauses.push("l.created_at >= ?");
        params.push(filters.dateFrom);
    }
    if (filters.dateTo) {
        clauses.push("l.created_at < DATE_ADD(?, INTERVAL 1 DAY)");
        params.push(filters.dateTo);
    }

    return {
        where: clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "",
        params,
    };
}

export async function listSuratPengajuanRows(filters, executor = pool) {
    const { where, params } = buildListWhere(filters);
    const [rows] = await executor.execute(
        `${LETTER_SELECT}${where}
         ORDER BY l.created_at DESC, l.id DESC
         LIMIT ? OFFSET ?`,
        [...params, String(filters.limit), String(filters.offset)],
    );
    return rows;
}

export async function countSuratPengajuanRows(filters, executor = pool) {
    const { where, params } = buildListWhere(filters);
    const [rows] = await executor.execute(
        `SELECT COUNT(*) AS total FROM letter l${where}`,
        params,
    );
    return Number(rows[0]?.total || 0);
}

export async function findAccountFamilyById(accountId, executor = pool) {
    const [rows] = await executor.execute(
        "SELECT id, role, family_id FROM acount WHERE id = ? LIMIT 1",
        [accountId],
    );
    return rows[0] || null;
}

export async function transitionSuratStatus(id, status, approvedBy, executor = pool) {
    const approvalFields = status === "disetujui"
        ? "approved_by = ?, approved_at = NOW(),"
        : "approved_by = NULL, approved_at = NULL,";
    const params = status === "disetujui"
        ? [status, approvedBy, id]
        : [status, id];

    const [result] = await executor.execute(
        `UPDATE letter
         SET status = ?, ${approvalFields} updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'pending'`,
        params,
    );
    return result;
}

export async function updateSuratArchived(id, isArchived, executor = pool) {
    const [result] = await executor.execute(
        "UPDATE letter SET is_archived = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [isArchived ? 1 : 0, id],
    );
    return result;
}

export async function listActiveSuratKategoriRows(executor = pool) {
    const [rows] = await executor.execute(
        `SELECT id, nama_kategori, is_active, sort_order, created_at
         FROM surat_kategori
         WHERE is_active = 1
         ORDER BY sort_order ASC, nama_kategori ASC, id ASC`,
    );
    return rows;
}

export async function insertSuratKategori(namaKategori, executor = pool) {
    const [result] = await executor.execute(
        "INSERT INTO surat_kategori (nama_kategori) VALUES (?)",
        [namaKategori],
    );
    return result.insertId;
}

export async function findSuratKategoriById(id, executor = pool) {
    const [rows] = await executor.execute(
        `SELECT id, nama_kategori, is_active, sort_order, created_at
         FROM surat_kategori WHERE id = ? LIMIT 1`,
        [id],
    );
    return rows[0] || null;
}
