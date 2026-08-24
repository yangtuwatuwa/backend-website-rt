import pool from "../config/sqlconfig.js";

/**
 * Migration: Pembuatan Tabel 'notifications' untuk Fitur Notifikasi In-App Generic
 */
export async function up() {
    console.log("===================================================================");
    console.log("🚀 MEMULAI MIGRATION: TABEL NOTIFICATIONS (IN-APP GENERIC)");
    console.log("===================================================================\n");

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        console.log("📦 Membuat tabel 'notifications' jika belum ada...");
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS notifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                account_id INT NOT NULL,
                type VARCHAR(50) NOT NULL,
                title VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                reference_type VARCHAR(50) NULL,
                reference_id INT NULL,
                is_read BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_notif_account_id (account_id),
                INDEX idx_notif_is_read (is_read),
                INDEX idx_notif_created_at (created_at),
                INDEX idx_notif_type (type),
                CONSTRAINT fk_notifications_account FOREIGN KEY (account_id) REFERENCES acount(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        await connection.commit();
        console.log("✅ Tabel 'notifications' berhasil dibuat!");
        return true;
    } catch (err) {
        await connection.rollback();
        console.error("❌ Gagal membuat tabel 'notifications':", err);
        throw err;
    } finally {
        connection.release();
    }
}

// Eksekusi jika dipanggil via node
if (process.argv[1] && (process.argv[1].endsWith("20260819_create_notifications_table.js") || process.argv[1].includes("create_notifications_table"))) {
    up().then(() => {
        process.exit(0);
    }).catch(() => {
        process.exit(1);
    });
}
