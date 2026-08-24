import pool from "../config/sqlconfig.js";

/**
 * Migration: Migrasi Skema Payments ke Arsitektur Rapel (payment_bill_links)
 * 
 * Langkah-langkah:
 * 1. Membuat tabel 'payment_bill_links' jika belum ada.
 * 2. Memeriksa kolom 'bill_id' di tabel 'payments'.
 * 3. Memindahkan (migrasi) data relasi 'bill_id' dan 'amount_stated' dari 'payments' ke 'payment_bill_links' (1 payment row lama -> 1 link row).
 * 4. Menghapus constraint foreign key & index pada 'bill_id' di 'payments'.
 * 5. Menghapus (DROP) kolom 'bill_id' di 'payments'.
 * 6. Mengubah nama kolom 'amount_stated' menjadi 'total_amount' di 'payments'.
 * 7. Memastikan tabel 'kas_contributions' dan 'bill_periods' & 'bills' lengkap.
 */
export async function up() {
    console.log("===================================================================");
    console.log("🚀 MEMULAI MIGRATION: PAYMENTS TO RAPEL (payment_bill_links)");
    console.log("===================================================================\n");

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // -----------------------------------------------------------------
        // 1. Pastikan tabel 'bill_periods' dan 'bills' ada
        // -----------------------------------------------------------------
        console.log("📦 1. Memeriksa tabel dasar 'bill_periods' & 'bills'...");
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS bill_periods (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                default_amount DECIMAL(12, 2) NOT NULL,
                due_date DATE NOT NULL,
                period_month TINYINT NOT NULL,
                period_year SMALLINT NOT NULL,
                status ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
                created_by INT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_bill_periods_year_month (period_year, period_month),
                INDEX idx_bill_periods_status (status),
                CONSTRAINT fk_bill_periods_created_by FOREIGN KEY (created_by) REFERENCES acount(id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS bills (
                id INT AUTO_INCREMENT PRIMARY KEY,
                bill_period_id INT NOT NULL,
                resident_id INT NOT NULL,
                amount DECIMAL(12, 2) NOT NULL,
                due_date DATE NOT NULL,
                status ENUM('unpaid', 'waiting_verification', 'paid', 'exempt') NOT NULL DEFAULT 'unpaid',
                exempt_reason TEXT NULL,
                exempt_by INT NULL,
                exempt_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_period_resident (bill_period_id, resident_id),
                INDEX idx_bills_resident_id (resident_id),
                INDEX idx_bills_bill_period_id (bill_period_id),
                INDEX idx_bills_status (status),
                INDEX idx_bills_due_date_status (due_date, status),
                CONSTRAINT fk_bills_bill_period FOREIGN KEY (bill_period_id) REFERENCES bill_periods(id) ON DELETE RESTRICT,
                CONSTRAINT fk_bills_resident FOREIGN KEY (resident_id) REFERENCES warga(id) ON DELETE RESTRICT,
                CONSTRAINT fk_bills_exempt_by FOREIGN KEY (exempt_by) REFERENCES acount(id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // -----------------------------------------------------------------
        // 2. Buat tabel 'payment_bill_links'
        // -----------------------------------------------------------------
        console.log("🔗 2. Membuat tabel 'payment_bill_links'...");
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS payment_bill_links (
                id INT AUTO_INCREMENT PRIMARY KEY,
                payment_id INT NOT NULL,
                bill_id INT NOT NULL,
                allocated_amount DECIMAL(12, 2) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_pbl_payment_id (payment_id),
                INDEX idx_pbl_bill_id (bill_id),
                CONSTRAINT fk_pbl_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE,
                CONSTRAINT fk_pbl_bill FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log("   ✅ Tabel 'payment_bill_links' siap.");

        // -----------------------------------------------------------------
        // 3. Cek apakah kolom 'bill_id' ada di tabel 'payments'
        // -----------------------------------------------------------------
        console.log("\n🔍 3. Memeriksa kolom di tabel 'payments'...");
        const [billIdColumns] = await connection.execute("SHOW COLUMNS FROM payments LIKE 'bill_id'");
        const hasBillId = billIdColumns.length > 0;

        const [amountStatedColumns] = await connection.execute("SHOW COLUMNS FROM payments LIKE 'amount_stated'");
        const hasAmountStated = amountStatedColumns.length > 0;

        const [totalAmountColumns] = await connection.execute("SHOW COLUMNS FROM payments LIKE 'total_amount'");
        const hasTotalAmount = totalAmountColumns.length > 0;

        if (hasBillId) {
            console.log("   ⚠️ Terdeteksi skema lama: kolom 'bill_id' masih ada di tabel 'payments'.");

            // -------------------------------------------------------------
            // 4. Migrasi data existing dari payments ke payment_bill_links
            // -------------------------------------------------------------
            console.log("   ⏳ Memindahkan data existing 'bill_id' ke 'payment_bill_links'...");
            const amountColumnToUse = hasAmountStated ? "amount_stated" : "total_amount";

            const [countOldRows] = await connection.execute(
                `SELECT COUNT(id) AS total FROM payments WHERE bill_id IS NOT NULL`
            );
            const totalToMigrate = countOldRows[0]?.total || 0;
            console.log(`   📊 Ditemukan ${totalToMigrate} data payment yang memiliki 'bill_id'.`);

            if (totalToMigrate > 0) {
                const [insertLinkResult] = await connection.execute(`
                    INSERT INTO payment_bill_links (payment_id, bill_id, allocated_amount, created_at)
                    SELECT id, bill_id, COALESCE(${amountColumnToUse}, 0), COALESCE(created_at, NOW())
                    FROM payments
                    WHERE bill_id IS NOT NULL
                    ON DUPLICATE KEY UPDATE allocated_amount = VALUES(allocated_amount);
                `);
                console.log(`   ✅ Berhasil memigrasikan ${insertLinkResult.affectedRows} relasi ke 'payment_bill_links'.`);
            }

            // -------------------------------------------------------------
            // 5. Drop Foreign Key pada 'bill_id' di tabel 'payments'
            // -------------------------------------------------------------
            console.log("   🔓 Mencari dan menghapus foreign key constraint pada 'bill_id'...");
            const [foreignKeys] = await connection.execute(`
                SELECT CONSTRAINT_NAME 
                FROM information_schema.KEY_COLUMN_USAGE 
                WHERE TABLE_SCHEMA = DATABASE() 
                  AND TABLE_NAME = 'payments' 
                  AND COLUMN_NAME = 'bill_id' 
                  AND REFERENCED_TABLE_NAME IS NOT NULL
            `);

            for (const fk of foreignKeys) {
                try {
                    console.log(`      Drop Foreign Key: ${fk.CONSTRAINT_NAME}...`);
                    await connection.execute(`ALTER TABLE payments DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``);
                } catch (e) {
                    console.log(`      ⚠️ Warning drop FK (${fk.CONSTRAINT_NAME}):`, e.message);
                }
            }

            // Drop index pada bill_id jika ada
            const [indexes] = await connection.execute("SHOW INDEX FROM payments WHERE Column_name = 'bill_id'");
            for (const idx of indexes) {
                if (idx.Key_name !== 'PRIMARY') {
                    try {
                        console.log(`      Drop Index: ${idx.Key_name}...`);
                        await connection.execute(`ALTER TABLE payments DROP INDEX \`${idx.Key_name}\``);
                    } catch (e) {
                        // Ignore
                    }
                }
            }

            // -------------------------------------------------------------
            // 6. Drop kolom 'bill_id' dari tabel 'payments'
            // -------------------------------------------------------------
            console.log("   🗑️ Menghapus kolom 'bill_id' dari tabel 'payments'...");
            await connection.execute("ALTER TABLE payments DROP COLUMN bill_id");
            console.log("   ✅ Kolom 'bill_id' berhasil di-drop.");
        } else {
            console.log("   ✅ Kolom 'bill_id' sudah tidak ada di tabel 'payments' (Skema sudah bersih).");
        }

        // -----------------------------------------------------------------
        // 7. Rename / adjust 'amount_stated' -> 'total_amount'
        // -----------------------------------------------------------------
        if (hasAmountStated) {
            console.log("\n📝 4. Menyesuaikan nama kolom 'amount_stated' -> 'total_amount'...");
            if (!hasTotalAmount) {
                await connection.execute("ALTER TABLE payments CHANGE COLUMN amount_stated total_amount DECIMAL(12, 2) NOT NULL");
                console.log("   ✅ Kolom 'amount_stated' berhasil di-rename menjadi 'total_amount'.");
            } else {
                await connection.execute("UPDATE payments SET total_amount = amount_stated WHERE (total_amount IS NULL OR total_amount = 0) AND amount_stated IS NOT NULL");
                await connection.execute("ALTER TABLE payments DROP COLUMN amount_stated");
                console.log("   ✅ Data dari 'amount_stated' disalin ke 'total_amount', kolom lama di-drop.");
            }
        } else if (!hasTotalAmount) {
            await connection.execute("ALTER TABLE payments ADD COLUMN total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0 AFTER resident_id");
            console.log("   ✅ Kolom 'total_amount' berhasil ditambahkan.");
        }

        // -----------------------------------------------------------------
        // 8. Pastikan tabel 'kas_contributions' ada
        // -----------------------------------------------------------------
        console.log("\n💰 5. Memeriksa tabel 'kas_contributions'...");
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS kas_contributions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                resident_id INT NOT NULL,
                amount DECIMAL(12, 2) NOT NULL,
                category ENUM('kematian', 'sosial', 'kegiatan', 'lainnya') NOT NULL,
                description TEXT NULL,
                channel ENUM('transfer', 'cash_to_rt', 'cash_to_bendahara') NOT NULL DEFAULT 'transfer',
                proof_url VARCHAR(255) NULL,
                status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
                reject_reason TEXT NULL,
                recorded_by INT NULL,
                verified_by INT NULL,
                verified_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_kas_resident_id (resident_id),
                INDEX idx_kas_status (status),
                INDEX idx_kas_category (category),
                INDEX idx_kas_created_at (created_at),
                CONSTRAINT fk_kas_resident FOREIGN KEY (resident_id) REFERENCES warga(id) ON DELETE RESTRICT,
                CONSTRAINT fk_kas_recorded_by FOREIGN KEY (recorded_by) REFERENCES acount(id) ON DELETE SET NULL,
                CONSTRAINT fk_kas_verified_by FOREIGN KEY (verified_by) REFERENCES acount(id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log("   ✅ Tabel 'kas_contributions' siap.");

        await connection.commit();

        console.log("\n===================================================================");
        console.log("🎉 MIGRATION BERHASIL 100%! SEMUA DATA HISTORIS AMAN TERSALIN.");
        console.log("===================================================================");

        return true;
    } catch (err) {
        await connection.rollback();
        console.error("\n❌ MIGRATION GAGAL (Rollback dilakukan):", err);
        throw err;
    } finally {
        connection.release();
    }
}

// Eksekusi jika dijalankan langsung via node CLI
if (process.argv[1] && (process.argv[1].endsWith("20260819_migrate_payments_to_rapel.js") || process.argv[1].includes("migrate_payments_to_rapel"))) {
    up().then(() => {
        process.exit(0);
    }).catch(() => {
        process.exit(1);
    });
}
