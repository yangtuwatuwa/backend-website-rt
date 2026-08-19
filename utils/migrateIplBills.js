import db from "../config/sqlconfig.js";

/**
 * Inisialisasi dan migrasi tabel-tabel modul Penagihan IPL
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

        // 2. Tabel bills
        await db.execute(`
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

        // 3. Tabel payments
        await db.execute(`
            CREATE TABLE IF NOT EXISTS payments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                bill_id INT NOT NULL,
                resident_id INT NOT NULL,
                amount_stated DECIMAL(12, 2) NOT NULL,
                channel ENUM('transfer', 'cash_to_rt', 'cash_to_bendahara') NOT NULL,
                proof_url VARCHAR(255) NULL,
                status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
                reject_reason TEXT NULL,
                recorded_by INT NULL,
                verified_by INT NULL,
                verified_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_payments_bill_id (bill_id),
                INDEX idx_payments_resident_id (resident_id),
                INDEX idx_payments_status (status),
                INDEX idx_payments_created_at (created_at),
                CONSTRAINT fk_payments_bill FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE RESTRICT,
                CONSTRAINT fk_payments_resident FOREIGN KEY (resident_id) REFERENCES warga(id) ON DELETE RESTRICT,
                CONSTRAINT fk_payments_recorded_by FOREIGN KEY (recorded_by) REFERENCES acount(id) ON DELETE SET NULL,
                CONSTRAINT fk_payments_verified_by FOREIGN KEY (verified_by) REFERENCES acount(id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        console.log("✅ Tabel IPL Billing (bill_periods, bills, payments) berhasil diinisialisasi.");
        return true;
    } catch (err) {
        console.error("❌ Gagal migrasi tabel IPL Billing:", err.message);
        throw err;
    }
}

// Eksekusi langsung jika dipanggil dari CLI
if (process.argv[1] && (process.argv[1].endsWith("migrateIplBills.js") || process.argv[1].includes("migrateIplBills"))) {
    initIplBillingTables().then(() => {
        process.exit(0);
    }).catch(() => {
        process.exit(1);
    });
}
