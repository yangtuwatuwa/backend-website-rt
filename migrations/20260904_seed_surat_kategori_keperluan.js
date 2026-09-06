import pool from "../config/sqlconfig.js";

export const REQUIRED_SURAT_KATEGORI = Object.freeze([
    "Membuat Surat Keterangan Domisili",
    "Membuat Surat Pengantar Nikah / Rujukan Kelurahan",
    "Membuat Surat Keterangan Tidak Mampu (SKTM)",
    "Membuat surat Izin Keramaian",
    "Lain-Lain",
]);

async function columnExists(executor, tableName, columnName) {
    const [rows] = await executor.execute(
        `SELECT 1
         FROM information_schema.columns
         WHERE table_schema = DATABASE()
           AND table_name = ?
           AND column_name = ?`,
        [tableName, columnName],
    );
    return rows.length > 0;
}

export async function up(executor = pool) {
    if (!await columnExists(executor, "surat_kategori", "sort_order")) {
        await executor.execute(
            "ALTER TABLE surat_kategori ADD COLUMN sort_order INT NOT NULL DEFAULT 999 AFTER is_active",
        );
    }

    // Kategori lama tidak dihapus karena mungkin masih direferensikan letter.
    await executor.execute("UPDATE surat_kategori SET is_active = 0");

    for (const [index, namaKategori] of REQUIRED_SURAT_KATEGORI.entries()) {
        await executor.execute(
            `INSERT INTO surat_kategori (nama_kategori, is_active, sort_order)
             VALUES (?, 1, ?)
             ON DUPLICATE KEY UPDATE
                is_active = VALUES(is_active),
                sort_order = VALUES(sort_order)`,
            [namaKategori, index + 1],
        );
    }
}

if (process.argv[1]?.includes("20260904_seed_surat_kategori_keperluan")) {
    up().then(async () => {
        console.log("Pilihan keperluan surat berhasil disinkronkan.");
        await pool.end();
    }).catch(async (error) => {
        console.error("Sinkronisasi pilihan keperluan surat gagal:", error);
        await pool.end();
        process.exitCode = 1;
    });
}
