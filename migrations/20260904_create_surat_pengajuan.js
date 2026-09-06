import pool from "../config/sqlconfig.js";

async function columnExists(executor, tableName, columnName) {
    const [rows] = await executor.execute(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
        [tableName, columnName],
    );
    return rows.length > 0;
}

async function constraintExists(executor, constraintName) {
    const [rows] = await executor.execute(
        `SELECT 1 FROM information_schema.table_constraints
         WHERE constraint_schema = DATABASE() AND constraint_name = ?`,
        [constraintName],
    );
    return rows.length > 0;
}

async function indexExists(executor, tableName, indexName) {
    const [rows] = await executor.execute(
        `SELECT 1 FROM information_schema.statistics
         WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
        [tableName, indexName],
    );
    return rows.length > 0;
}

export async function up(executor = pool) {
    await executor.execute(`
        CREATE TABLE IF NOT EXISTS surat_kategori (
            id INT PRIMARY KEY AUTO_INCREMENT,
            nama_kategori VARCHAR(150) NOT NULL UNIQUE,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            sort_order INT NOT NULL DEFAULT 999,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    const columns = [
        ["kategori_id", "INT NULL AFTER family_id"],
        ["nama_lengkap", "VARCHAR(150) NULL"],
        ["jenis_kelamin", "VARCHAR(20) NULL"],
        ["tempat_lahir", "VARCHAR(100) NULL"],
        ["tanggal_lahir", "DATE NULL"],
        ["no_ktp", "VARCHAR(20) NULL"],
        ["alamat", "TEXT NULL"],
        ["agama", "VARCHAR(50) NULL"],
        ["pekerjaan", "VARCHAR(100) NULL"],
        ["kewarganegaraan", "VARCHAR(50) NULL"],
        ["approved_by", "INT NULL"],
        ["approved_at", "DATETIME NULL"],
    ];
    for (const [name, definition] of columns) {
        if (!await columnExists(executor, "letter", name)) {
            await executor.execute(`ALTER TABLE letter ADD COLUMN ${name} ${definition}`);
        }
    }

    if (!await indexExists(executor, "letter", "idx_letter_kategori_id")) {
        await executor.execute("ALTER TABLE letter ADD INDEX idx_letter_kategori_id (kategori_id)");
    }
    if (!await indexExists(executor, "letter", "idx_letter_created_at")) {
        await executor.execute("ALTER TABLE letter ADD INDEX idx_letter_created_at (created_at)");
    }
    if (!await constraintExists(executor, "fk_letter_kategori")) {
        await executor.execute("ALTER TABLE letter ADD CONSTRAINT fk_letter_kategori FOREIGN KEY (kategori_id) REFERENCES surat_kategori(id)");
    }
    if (!await constraintExists(executor, "fk_letter_approved_by")) {
        await executor.execute("ALTER TABLE letter ADD CONSTRAINT fk_letter_approved_by FOREIGN KEY (approved_by) REFERENCES acount(id) ON DELETE SET NULL");
    }

    if (await columnExists(executor, "letter", "jenis")) {
        await executor.execute(`
            INSERT INTO surat_kategori (nama_kategori)
            SELECT DISTINCT jenis FROM letter WHERE jenis IS NOT NULL
            ON DUPLICATE KEY UPDATE nama_kategori = VALUES(nama_kategori)
        `);
        await executor.execute(`
            UPDATE letter l
            JOIN surat_kategori k ON k.nama_kategori = l.jenis
            SET l.kategori_id = k.id
            WHERE l.kategori_id IS NULL
        `);

        const [unmappedRows] = await executor.execute(
            "SELECT COUNT(*) AS total FROM letter WHERE kategori_id IS NULL",
        );
        const unmapped = Number(unmappedRows[0]?.total || 0);
        if (unmapped !== 0) {
            throw new Error(`Migrasi dihentikan: ${unmapped} baris letter belum memiliki kategori_id. Kolom jenis dipertahankan.`);
        }

        await executor.execute("ALTER TABLE letter MODIFY COLUMN kategori_id INT NOT NULL");
        await executor.execute("ALTER TABLE letter DROP COLUMN jenis");
    } else {
        const [unmappedRows] = await executor.execute(
            "SELECT COUNT(*) AS total FROM letter WHERE kategori_id IS NULL",
        );
        if (Number(unmappedRows[0]?.total || 0) !== 0) {
            throw new Error("Schema tidak konsisten: jenis sudah tidak ada tetapi masih ada kategori_id NULL.");
        }
        await executor.execute("ALTER TABLE letter MODIFY COLUMN kategori_id INT NOT NULL");
    }
}

if (process.argv[1]?.includes("20260904_create_surat_pengajuan")) {
    up().then(async () => {
        console.log("Migration surat pengajuan berhasil dijalankan dan terverifikasi.");
        await pool.end();
    }).catch(async (error) => {
        console.error("Migration surat pengajuan gagal:", error);
        await pool.end();
        process.exitCode = 1;
    });
}
