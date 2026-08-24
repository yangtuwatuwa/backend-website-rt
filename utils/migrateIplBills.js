import db from "../config/sqlconfig.js";

/**
 * Inisialisasi dan migrasi tabel-tabel modul Penagihan IPL & Kas RT berbasis Keluarga (family_id)
 */
export async function initIplBillingTables() {
    try {
        // 1. Tabel bill_periods
        await db.execute(`
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

        // 2. Tabel bills (Scope: family_id)
        await db.execute(`
            CREATE TABLE IF NOT EXISTS bills (
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

        // 3. Tabel payments (Scope: family_id & Many-to-Many / Single & Rapel)
        await db.execute(`
            CREATE TABLE IF NOT EXISTS payments (
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

        // 4. Tabel penghubung payment_bill_links (Dukungan Rapel)
        await db.execute(`
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

        // 5. Tabel kas_contributions (Scope: family_id)
        await db.execute(`
            CREATE TABLE IF NOT EXISTS kas_contributions (
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

        // 6. Penyesuaian skema jika sebelumnya pernah ada kolom resident_id
        try {
            const [billResCols] = await db.execute("SHOW COLUMNS FROM bills LIKE 'resident_id'");
            if (billResCols.length > 0) {
                // Drop FK dan ganti kolom
                try {
                    await db.execute("ALTER TABLE bills DROP FOREIGN KEY fk_bills_resident");
                } catch (e) {}
                try {
                    await db.execute("ALTER TABLE bills DROP INDEX uq_period_resident");
                } catch (e) {}
                try {
                    await db.execute("ALTER TABLE bills DROP INDEX idx_bills_resident_id");
                } catch (e) {}
                // Jika family_id belum ada
                const [billFamCols] = await db.execute("SHOW COLUMNS FROM bills LIKE 'family_id'");
                if (billFamCols.length === 0) {
                    await db.execute("ALTER TABLE bills ADD COLUMN family_id INT NOT NULL AFTER bill_period_id");
                    await db.execute("UPDATE bills b JOIN warga w ON b.resident_id = w.id SET b.family_id = w.family_id");
                    await db.execute("ALTER TABLE bills ADD CONSTRAINT fk_bills_family FOREIGN KEY (family_id) REFERENCES family(id) ON DELETE RESTRICT");
                    await db.execute("ALTER TABLE bills ADD UNIQUE KEY uq_period_family (bill_period_id, family_id)");
                }
                try {
                    await db.execute("ALTER TABLE bills DROP COLUMN resident_id");
                } catch (e) {}
            }

            const [payResCols] = await db.execute("SHOW COLUMNS FROM payments LIKE 'resident_id'");
            if (payResCols.length > 0) {
                try {
                    await db.execute("ALTER TABLE payments DROP FOREIGN KEY fk_payments_resident");
                } catch (e) {}
                const [payFamCols] = await db.execute("SHOW COLUMNS FROM payments LIKE 'family_id'");
                if (payFamCols.length === 0) {
                    await db.execute("ALTER TABLE payments ADD COLUMN family_id INT NOT NULL AFTER id");
                    await db.execute("UPDATE payments p JOIN warga w ON p.resident_id = w.id SET p.family_id = w.family_id");
                    await db.execute("ALTER TABLE payments ADD CONSTRAINT fk_payments_family FOREIGN KEY (family_id) REFERENCES family(id) ON DELETE RESTRICT");
                }
                try {
                    await db.execute("ALTER TABLE payments DROP COLUMN resident_id");
                } catch (e) {}
            }

            const [kasResCols] = await db.execute("SHOW COLUMNS FROM kas_contributions LIKE 'resident_id'");
            if (kasResCols.length > 0) {
                try {
                    await db.execute("ALTER TABLE kas_contributions DROP FOREIGN KEY fk_kas_resident");
                } catch (e) {}
                const [kasFamCols] = await db.execute("SHOW COLUMNS FROM kas_contributions LIKE 'family_id'");
                if (kasFamCols.length === 0) {
                    await db.execute("ALTER TABLE kas_contributions ADD COLUMN family_id INT NOT NULL AFTER id");
                    await db.execute("UPDATE kas_contributions k JOIN warga w ON k.resident_id = w.id SET k.family_id = w.family_id");
                    await db.execute("ALTER TABLE kas_contributions ADD CONSTRAINT fk_kas_family FOREIGN KEY (family_id) REFERENCES family(id) ON DELETE RESTRICT");
                }
                try {
                    await db.execute("ALTER TABLE kas_contributions DROP COLUMN resident_id");
                } catch (e) {}
            }
        } catch (schemaErr) {
            console.log("ℹ️ Info sinkronisasi skema family_id:", schemaErr.message);
        }

        console.log("✅ Tabel-tabel Modul Penagihan IPL & Kas RT (Scope: family_id) berhasil diinisialisasi!");
    } catch (err) {
        console.error("❌ Gagal menginisialisasi tabel IPL & Kas:", err);
        throw err;
    }
}

// Eksekusi jika dipanggil langsung
if (process.argv[1] && (process.argv[1].endsWith("migrateIplBills.js") || process.argv[1].includes("migrateIplBills"))) {
    initIplBillingTables().then(() => {
        console.log("Proses inisialisasi selesai masbro.");
        process.exit(0);
    }).catch(() => {
        process.exit(1);
    });
}
