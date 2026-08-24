import pool from "../config/sqlconfig.js";

/**
 * Migration: Penyesuaian Unit Dasar Keuangan IPL & Kas ke Scope Keluarga (family_id)
 * 
 * 1. Menghapus data testing lama (bills, payments, payment_bill_links, kas_contributions).
 * 2. Memperbarui tabel 'bills':
 *    - Ganti 'resident_id' -> 'family_id' (FK ke family.id)
 *    - UNIQUE KEY (bill_period_id, family_id)
 * 3. Memperbarui tabel 'payments':
 *    - Ganti 'resident_id' -> 'family_id' (FK ke family.id)
 * 4. Memperbarui tabel 'kas_contributions':
 *    - Ganti 'resident_id' -> 'family_id' (FK ke family.id)
 * 5. Memastikan 'payment_bill_links' tetap many-to-many antara payments & bills.
 */
export async function up() {
    console.log("===================================================================");
    console.log("🚀 MEMULAI MIGRATION: KEUANGAN IPL & KAS KE SCOPE KELUARGA (family_id)");
    console.log("===================================================================\n");

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // -----------------------------------------------------------------
        // 1. Bersihkan Data Testing Lama (Sesuai Arahan User)
        // -----------------------------------------------------------------
        console.log("🧹 1. Membersihkan data testing lama...");
        await connection.query("SET FOREIGN_KEY_CHECKS = 0;");
        await connection.query("DELETE FROM payment_bill_links WHERE id > 0;");
        await connection.query("DELETE FROM payments WHERE id > 0;");
        await connection.query("DELETE FROM bills WHERE id > 0;");
        await connection.query("DELETE FROM kas_contributions WHERE id > 0;");
        await connection.query("SET FOREIGN_KEY_CHECKS = 1;");
        console.log("   ✅ Data testing lama berhasil dibersihkan.");

        // -----------------------------------------------------------------
        // 2. Drop dan Re-create Tabel 'bills' dengan Scope family_id & UNIQUE(bill_period_id, family_id)
        // -----------------------------------------------------------------
        console.log("\n📦 2. Memperbarui tabel 'bills' (family_id)...");
        await connection.query("SET FOREIGN_KEY_CHECKS = 0;");
        await connection.execute("DROP TABLE IF EXISTS bills;");
        await connection.execute(`
            CREATE TABLE bills (
                id INT AUTO_INCREMENT PRIMARY KEY,
                bill_period_id INT NOT NULL,
                family_id INT NOT NULL,
                amount DECIMAL(12, 2) NOT NULL,
                due_date DATE NOT NULL,
                status ENUM('unpaid', 'waiting_verification', 'paid', 'exempt') NOT NULL DEFAULT 'unpaid',
                exempt_reason TEXT NULL,
                exempt_by INT NULL,
                exempt_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_period_family (bill_period_id, family_id),
                INDEX idx_bills_family_id (family_id),
                INDEX idx_bills_bill_period_id (bill_period_id),
                INDEX idx_bills_status (status),
                INDEX idx_bills_due_date_status (due_date, status),
                CONSTRAINT fk_bills_bill_period FOREIGN KEY (bill_period_id) REFERENCES bill_periods(id) ON DELETE RESTRICT,
                CONSTRAINT fk_bills_family FOREIGN KEY (family_id) REFERENCES family(id) ON DELETE RESTRICT,
                CONSTRAINT fk_bills_exempt_by FOREIGN KEY (exempt_by) REFERENCES acount(id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log("   ✅ Tabel 'bills' berhasil dibuat dengan FK family_id dan UNIQUE KEY (bill_period_id, family_id).");

        // -----------------------------------------------------------------
        // 3. Drop dan Re-create Tabel 'payments' dengan family_id
        // -----------------------------------------------------------------
        console.log("\n💳 3. Memperbarui tabel 'payments' (family_id)...");
        await connection.execute("DROP TABLE IF EXISTS payments;");
        await connection.execute(`
            CREATE TABLE payments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                family_id INT NOT NULL,
                total_amount DECIMAL(12, 2) NOT NULL,
                channel ENUM('transfer', 'cash_to_rt', 'cash_to_bendahara') NOT NULL,
                proof_url VARCHAR(255) NULL,
                status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
                reject_reason TEXT NULL,
                recorded_by INT NULL,
                verified_by INT NULL,
                verified_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_payments_family_id (family_id),
                INDEX idx_payments_status (status),
                INDEX idx_payments_created_at (created_at),
                CONSTRAINT fk_payments_family FOREIGN KEY (family_id) REFERENCES family(id) ON DELETE RESTRICT,
                CONSTRAINT fk_payments_recorded_by FOREIGN KEY (recorded_by) REFERENCES acount(id) ON DELETE SET NULL,
                CONSTRAINT fk_payments_verified_by FOREIGN KEY (verified_by) REFERENCES acount(id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log("   ✅ Tabel 'payments' berhasil dibuat dengan FK family_id.");

        // -----------------------------------------------------------------
        // 4. Drop dan Re-create Tabel 'payment_bill_links'
        // -----------------------------------------------------------------
        console.log("\n🔗 4. Memperbarui tabel 'payment_bill_links'...");
        await connection.execute("DROP TABLE IF EXISTS payment_bill_links;");
        await connection.execute(`
            CREATE TABLE payment_bill_links (
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
        // 5. Drop dan Re-create Tabel 'kas_contributions' dengan family_id
        // -----------------------------------------------------------------
        console.log("\n💰 5. Memperbarui tabel 'kas_contributions' (family_id)...");
        await connection.execute("DROP TABLE IF EXISTS kas_contributions;");
        await connection.execute(`
            CREATE TABLE kas_contributions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                family_id INT NOT NULL,
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
                INDEX idx_kas_family_id (family_id),
                INDEX idx_kas_status (status),
                INDEX idx_kas_category (category),
                INDEX idx_kas_created_at (created_at),
                CONSTRAINT fk_kas_family FOREIGN KEY (family_id) REFERENCES family(id) ON DELETE RESTRICT,
                CONSTRAINT fk_kas_recorded_by FOREIGN KEY (recorded_by) REFERENCES acount(id) ON DELETE SET NULL,
                CONSTRAINT fk_kas_verified_by FOREIGN KEY (verified_by) REFERENCES acount(id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        await connection.query("SET FOREIGN_KEY_CHECKS = 1;");
        console.log("   ✅ Tabel 'kas_contributions' berhasil dibuat dengan FK family_id.");

        await connection.commit();

        console.log("\n===================================================================");
        console.log("🎉 MIGRATION SKEMA KE FAMILY_ID SUKSES 100%!");
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
if (process.argv[1] && (process.argv[1].endsWith("20260819_migrate_to_family_scope.js") || process.argv[1].includes("migrate_to_family_scope"))) {
    up().then(() => {
        process.exit(0);
    }).catch(() => {
        process.exit(1);
    });
}
