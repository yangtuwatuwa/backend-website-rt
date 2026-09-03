import pool from "../config/sqlconfig.js";

export async function up(executor = pool) {
    await executor.execute(`
        CREATE TABLE IF NOT EXISTS kas_transaksi (
            id INT AUTO_INCREMENT PRIMARY KEY,
            tanggal DATE NOT NULL,
            deskripsi TEXT NOT NULL,
            kategori_kas VARCHAR(100) NOT NULL,
            tipe_mutasi ENUM('masuk', 'keluar') NOT NULL,
            nominal DECIMAL(15, 2) UNSIGNED NOT NULL,
            created_by INT NULL,
            updated_by INT NULL,
            deleted_by INT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            deleted_at DATETIME NULL,
            INDEX idx_kas_transaksi_tanggal (tanggal),
            INDEX idx_kas_transaksi_tipe (tipe_mutasi),
            INDEX idx_kas_transaksi_kategori (kategori_kas),
            INDEX idx_kas_transaksi_deleted_at (deleted_at),
            CONSTRAINT fk_kas_transaksi_created_by FOREIGN KEY (created_by) REFERENCES acount(id) ON DELETE SET NULL,
            CONSTRAINT fk_kas_transaksi_updated_by FOREIGN KEY (updated_by) REFERENCES acount(id) ON DELETE SET NULL,
            CONSTRAINT fk_kas_transaksi_deleted_by FOREIGN KEY (deleted_by) REFERENCES acount(id) ON DELETE SET NULL,
            CONSTRAINT chk_kas_transaksi_nominal_positif CHECK (nominal > 0)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log("Migration kas_transaksi berhasil dijalankan.");
}

if (process.argv[1]?.includes("20260902_create_kas_transaksi")) {
    up().then(() => pool.end()).catch(async (error) => {
        console.error("Migration kas_transaksi gagal:", error);
        await pool.end();
        process.exitCode = 1;
    });
}
