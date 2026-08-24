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
                    await db.execute("ALTER TABLE payments DROP COLUMN bill_id");
                } catch (e) {
                    // Ignore
                }
            }

            const [amountStatedCols] = await db.execute("SHOW COLUMNS FROM payments LIKE 'amount_stated'");
            if (amountStatedCols.length > 0) {
                const [totalAmountCols] = await db.execute("SHOW COLUMNS FROM payments LIKE 'total_amount'");
                if (totalAmountCols.length === 0) {
                    await db.execute("ALTER TABLE payments CHANGE COLUMN amount_stated total_amount DECIMAL(12, 2) NOT NULL");
                } else {
                    await db.execute("UPDATE payments SET total_amount = amount_stated WHERE total_amount IS NULL OR total_amount = 0");
                    await db.execute("ALTER TABLE payments DROP COLUMN amount_stated");
                }
            }
        } catch (schemaErr) {
            console.log("ℹ️ Info pengecekan skema payments:", schemaErr.message);
        }

        // 7. Migrasi data historis dari ipl_payment (jika ada data lama di DB)
        try {
            const [iplTables] = await db.execute("SHOW TABLES LIKE 'ipl_payment'");
            if (iplTables.length > 0) {
                const [oldIplRows] = await db.execute("SELECT * FROM ipl_payment");
                if (Array.isArray(oldIplRows) && oldIplRows.length > 0) {
                    console.log(`⏳ Memigrasikan ${oldIplRows.length} data historis dari ipl_payment...`);
                    for (const row of oldIplRows) {
                        try {
                            const month = Number(row.month || 1);
                            const year = Number(row.year || new Date().getFullYear());
                            const monthTitle = `IPL ${month}/${year}`;
                            const dueDate = `${year}-${String(month).padStart(2, '0')}-10`;

                            // 1. Pastikan bill_period ada
                            let [periods] = await db.execute("SELECT id FROM bill_periods WHERE period_month = ? AND period_year = ? LIMIT 1", [month, year]);
                            let periodId;
                            if (periods.length > 0) {
                                periodId = periods[0].id;
                            } else {
                                const [createP] = await db.execute(
                                    "INSERT INTO bill_periods (title, default_amount, due_date, period_month, period_year, status) VALUES (?, ?, ?, ?, ?, 'published')",
                                    [monthTitle, row.amount || 200000, dueDate, month, year]
                                );
                                periodId = createP.insertId;
                            }

                            const familyId = row.family_id;
                            if (familyId) {
                                const billStatus = row.status === 'diterima' ? 'paid' : (row.status === 'pending' ? 'waiting_verification' : 'unpaid');
                                const paymentStatus = row.status === 'diterima' ? 'approved' : (row.status === 'ditolak' ? 'rejected' : 'pending');

                                // 2. Pastikan bill ada
                                let [bills] = await db.execute("SELECT id FROM bills WHERE bill_period_id = ? AND family_id = ? LIMIT 1", [periodId, familyId]);
                                let billId;
                                if (bills.length > 0) {
                                    billId = bills[0].id;
                                    if (billStatus === 'paid') {
                                        await db.execute("UPDATE bills SET status = 'paid' WHERE id = ?", [billId]);
                                    }
                                } else {
                                    const [createB] = await db.execute(
                                        "INSERT INTO bills (bill_period_id, family_id, amount, due_date, status) VALUES (?, ?, ?, ?, ?)",
                                        [periodId, familyId, row.amount || 200000, dueDate, billStatus]
                                    );
                                    billId = createB.insertId;
                                }

                                // 3. Buat payments & payment_bill_links
                                const [payRes] = await db.execute(
                                    `INSERT INTO payments (family_id, total_amount, channel, proof_url, status, created_at)
                                     VALUES (?, ?, 'transfer', ?, ?, ?)`,
                                    [familyId, row.amount || 200000, row.payment_proof || 'migrated', paymentStatus, row.payment_date || new Date()]
                                );
                                const payId = payRes.insertId;

                                await db.execute(
                                    "INSERT INTO payment_bill_links (payment_id, bill_id, allocated_amount) VALUES (?, ?, ?)",
                                    [payId, billId, row.amount || 200000]
                                );
                            }
                        } catch (singleMigrateErr) {
                            console.log("Warning migrasi row ipl_payment:", singleMigrateErr.message);
                        }
                    }
                    console.log("✅ Data historis ipl_payment berhasil dimigrasikan.");
                }

                // Drop tabel ipl_payment setelah data termigrasi
                await db.execute("DROP TABLE IF EXISTS ipl_payment");
                console.log("🗑️ Tabel usang 'ipl_payment' berhasil di-drop.");
            }
        } catch (migErr) {
            console.log("ℹ️ Info migrasi ipl_payment:", migErr.message);
        }

        // 8. Migrasi data historis dari kas_payment (jika ada data lama di DB)
        try {
            const [kasTables] = await db.execute("SHOW TABLES LIKE 'kas_payment'");
            if (kasTables.length > 0) {
                const [oldKasRows] = await db.execute("SELECT * FROM kas_payment");
                if (Array.isArray(oldKasRows) && oldKasRows.length > 0) {
                    console.log(`⏳ Memigrasikan ${oldKasRows.length} data historis dari kas_payment...`);
                    for (const row of oldKasRows) {
                        try {
                            const familyId = row.family_id || 1;
                            const status = row.status === 'diterima' ? 'approved' : (row.status === 'ditolak' ? 'rejected' : 'pending');
                            const category = ['kematian', 'sosial', 'kegiatan', 'lainnya'].includes(row.category) ? row.category : 'lainnya';

                            await db.execute(
                                `INSERT INTO kas_contributions (family_id, amount, category, description, channel, proof_url, status, created_at)
                                 VALUES (?, ?, ?, ?, 'transfer', ?, ?, ?)`,
                                [familyId, row.amount || 0, category, row.description || '-', row.payment_proof || 'migrated', status, row.payment_date || new Date()]
                            );
                        } catch (singleKasErr) {
                            console.log("Warning migrasi row kas_payment:", singleKasErr.message);
                        }
                    }
                    console.log("✅ Data historis kas_payment berhasil dimigrasikan.");
                }

                // Drop tabel kas_payment setelah data termigrasi
                await db.execute("DROP TABLE IF EXISTS kas_payment");
                console.log("🗑️ Tabel usang 'kas_payment' berhasil di-drop.");
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
