import pool from "../config/sqlconfig.js";

export async function up(executor = pool) {
    await executor.execute(`
        CREATE TABLE IF NOT EXISTS notulen_rapat (
            id INT PRIMARY KEY AUTO_INCREMENT,
            tanggal_rapat DATE NOT NULL,
            topik VARCHAR(200) NOT NULL,
            hasil_keputusan VARCHAR(200) NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
}

if (process.argv[1]?.includes("20260904_create_notulen_rapat")) {
    up().then(async () => {
        console.log("Migration notulen_rapat berhasil dijalankan.");
        await pool.end();
    }).catch(async (error) => {
        console.error("Migration notulen_rapat gagal:", error);
        await pool.end();
        process.exitCode = 1;
    });
}
