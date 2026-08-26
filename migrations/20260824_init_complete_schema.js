import pool from "../config/sqlconfig.js";

/**
 * Migration: Setup Inisialisasi Database Lengkap dari Nol (Reset & Recreate 24 Tabel)
 * 
 * PERINGATAN:
 * Script ini menjalankan DROP TABLE IF EXISTS sebelum CREATE TABLE.
 * Hanya gunakan script ini untuk setup/reset database baru dari nol.
 */
export async function up() {
    console.log("===================================================================");
    console.log("🚀 MEMULAI RESET & INISIALISASI SKEMA DATABASE BARU (24 TABEL)");
    console.log("===================================================================\n");

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();
        
        // -----------------------------------------------------------------
        // 1. Matikan Foreign Key Checks Sebelum Drop & Create
        // -----------------------------------------------------------------
        console.log("🔓 1. Mematikan Foreign Key Checks...");
        await connection.query("SET FOREIGN_KEY_CHECKS = 0;");

        // -----------------------------------------------------------------
        // 2. Drop Seluruh Tabel Lama (Urutan Child -> Parent & Legacy Tables)
        // -----------------------------------------------------------------
        console.log("\n🗑️ 2. Membersihkan tabel-tabel lama jika ada...");
        const tablesToDrop = [
            // Tabel transaksi / relasi child
            "notifications",
            "payment_bill_links",
            "payments",
            "bills",
            "bill_periods",
            "kas_contributions",
            "financial_ledger",
            "financial_settings",
            "template_surat",
            "surat_keluar",
            "surat_masuk",
            "otp_codes",
            "access_logs",
            "vote_karyawan",
            "karyawan",
            "agenda",
            "announcement",
            "letter",
            "report",
            "document",
            "acount",
            "warga",
            "family",
            "house",
            // Tabel legacy / sisa migrasi lama jika ada
            "ipl_payment",
            "kas_payment",
            "payment"
        ];

        for (const table of tablesToDrop) {
            await connection.execute(`DROP TABLE IF EXISTS \`${table}\`;`);
            console.log(`   - DROP TABLE IF EXISTS \`${table}\``);
        }
        console.log("   ✅ Seluruh tabel lama berhasil dibersihkan.");

        // -----------------------------------------------------------------
        // 3. Buat Ulang Seluruh 24 Tabel dengan Skema Terkini
        // -----------------------------------------------------------------
        console.log("\n📦 3. Membangun 24 tabel dengan skema termutakhir...\n");

        // 1. house
        console.log("   [1/24] Membuat tabel 'house'...");
        await connection.execute(`
            CREATE TABLE house (
                id INT AUTO_INCREMENT PRIMARY KEY,
                blok VARCHAR(255) NOT NULL,
                nomor VARCHAR(255) NOT NULL,
                alamat TEXT NOT NULL,
                status VARCHAR(50) NOT NULL DEFAULT 'pribadi',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // 2. family (kepala_keluarga_id NULL-able)
        console.log("   [2/24] Membuat tabel 'family'...");
        await connection.execute(`
            CREATE TABLE family (
                id INT AUTO_INCREMENT PRIMARY KEY,
                no_kk VARCHAR(255) NOT NULL,
                house_id INT NOT NULL,
                kepala_keluarga_id INT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_family_house_id (house_id),
                INDEX idx_family_kepala_keluarga (kepala_keluarga_id),
                CONSTRAINT fk_family_house FOREIGN KEY (house_id) REFERENCES house (id) ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // 3. warga (tgl_lahir VARCHAR(255) untuk ciphertext)
        console.log("   [3/24] Membuat tabel 'warga'...");
        await connection.execute(`
            CREATE TABLE warga (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nik VARCHAR(255) NOT NULL,
                nama VARCHAR(255) NOT NULL,
                jenis_kelamin VARCHAR(50) NOT NULL,
                tgl_lahir VARCHAR(255) NOT NULL,
                status_hidup VARCHAR(50) NOT NULL DEFAULT 'Hidup',
                no_hp VARCHAR(255) NOT NULL,
                umur INT NOT NULL DEFAULT 0,
                family_id INT NOT NULL,
                house_id INT NOT NULL,
                status_data ENUM('pending', 'diterima', 'ditolak') NOT NULL DEFAULT 'diterima',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_warga_family_id (family_id),
                INDEX idx_warga_house_id (house_id),
                INDEX idx_warga_status_data (status_data),
                CONSTRAINT fk_warga_family FOREIGN KEY (family_id) REFERENCES family (id) ON DELETE RESTRICT,
                CONSTRAINT fk_warga_house FOREIGN KEY (house_id) REFERENCES house (id) ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // FK kepala_keluarga_id
        await connection.execute(`
            ALTER TABLE family ADD CONSTRAINT fk_family_kepala_keluarga 
            FOREIGN KEY (kepala_keluarga_id) REFERENCES warga (id) ON DELETE SET NULL;
        `);

        // 4. acount (email_encrypted VARBINARY(255) & email_blind_idx CHAR(64) UNIQUE)
        console.log("   [4/24] Membuat tabel 'acount'...");
        await connection.execute(`
            CREATE TABLE acount (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(100) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                email_encrypted VARBINARY(255) NOT NULL,
                email_blind_idx CHAR(64) NOT NULL,
                role ENUM('rt', 'sekertaris', 'bendahara', 'warga', 'admin') NOT NULL,
                family_id INT NULL,
                must_change_password TINYINT(1) NOT NULL DEFAULT 1,
                is_verified TINYINT(1) NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_acount_email_blind_idx (email_blind_idx),
                INDEX idx_acount_family_id (family_id),
                CONSTRAINT fk_acount_family FOREIGN KEY (family_id) REFERENCES family (id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // 5. document
        console.log("   [5/24] Membuat tabel 'document'...");
        await connection.execute(`
            CREATE TABLE document (
                id INT AUTO_INCREMENT PRIMARY KEY,
                family_id INT NOT NULL,
                resident_id INT NOT NULL,
                type ENUM('kk', 'ktp', 'akta', 'kia', 'foto') NOT NULL,
                file_path VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_document_family_id (family_id),
                INDEX idx_document_resident_id (resident_id),
                CONSTRAINT fk_document_family FOREIGN KEY (family_id) REFERENCES family (id) ON DELETE CASCADE,
                CONSTRAINT fk_document_resident FOREIGN KEY (resident_id) REFERENCES warga (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // 6. report
        console.log("   [6/24] Membuat tabel 'report'...");
        await connection.execute(`
            CREATE TABLE report (
                id INT AUTO_INCREMENT PRIMARY KEY,
                family_id INT NOT NULL,
                isi TEXT NOT NULL,
                jenis_pengaduan VARCHAR(100) NOT NULL,
                status ENUM('pending', 'disetujui', 'ditolak') NOT NULL DEFAULT 'pending',
                catatan TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_report_family_id (family_id),
                INDEX idx_report_status (status),
                CONSTRAINT fk_report_family FOREIGN KEY (family_id) REFERENCES family (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // 7. letter
        console.log("   [7/24] Membuat tabel 'letter'...");
        await connection.execute(`
            CREATE TABLE letter (
                id INT AUTO_INCREMENT PRIMARY KEY,
                family_id INT NOT NULL,
                keperluan TEXT NOT NULL,
                jenis VARCHAR(100) NOT NULL,
                status ENUM('pending', 'disetujui', 'ditolak') NOT NULL DEFAULT 'pending',
                is_archived TINYINT(1) NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_letter_family_id (family_id),
                INDEX idx_letter_status (status),
                CONSTRAINT fk_letter_family FOREIGN KEY (family_id) REFERENCES family (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // 8. announcement
        console.log("   [8/24] Membuat tabel 'announcement'...");
        await connection.execute(`
            CREATE TABLE announcement (
                id INT AUTO_INCREMENT PRIMARY KEY,
                judul VARCHAR(255) NOT NULL,
                isi TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // 9. agenda
        console.log("   [9/24] Membuat tabel 'agenda'...");
        await connection.execute(`
            CREATE TABLE agenda (
                id INT AUTO_INCREMENT PRIMARY KEY,
                kategori VARCHAR(100) NOT NULL,
                judul VARCHAR(255) NOT NULL,
                deskripsi TEXT NULL,
                tanggal DATE NOT NULL,
                waktu VARCHAR(100) NOT NULL,
                tempat VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_agenda_tanggal (tanggal)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // 10. karyawan
        console.log("   [10/24] Membuat tabel 'karyawan'...");
        await connection.execute(`
            CREATE TABLE karyawan (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nama VARCHAR(255) NOT NULL,
                jabatan VARCHAR(100) NOT NULL,
                deskripsi TEXT NULL,
                foto VARCHAR(255) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // 11. vote_karyawan
        console.log("   [11/24] Membuat tabel 'vote_karyawan'...");
        await connection.execute(`
            CREATE TABLE vote_karyawan (
                id INT AUTO_INCREMENT PRIMARY KEY,
                account_id INT NOT NULL,
                karyawan_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_vote_account (account_id),
                INDEX idx_vote_karyawan (karyawan_id),
                CONSTRAINT fk_vote_account FOREIGN KEY (account_id) REFERENCES acount (id) ON DELETE CASCADE,
                CONSTRAINT fk_vote_karyawan FOREIGN KEY (karyawan_id) REFERENCES karyawan (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // 12. access_logs
        console.log("   [12/24] Membuat tabel 'access_logs'...");
        await connection.execute(`
            CREATE TABLE access_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(255) NULL,
                event_type VARCHAR(100) NULL,
                ip_address VARCHAR(100) NULL,
                user_agent TEXT NULL,
                status VARCHAR(50) NULL,
                details TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_access_logs_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // 13. otp_codes
        console.log("   [13/24] Membuat tabel 'otp_codes'...");
        await connection.execute(`
            CREATE TABLE otp_codes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                otp_hash VARCHAR(255) NOT NULL,
                purpose VARCHAR(50) NOT NULL DEFAULT 'VERIFICATION',
                is_used TINYINT(1) NOT NULL DEFAULT 0,
                attempts INT NOT NULL DEFAULT 0,
                expires_at DATETIME NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_otp_user_purpose (user_id, purpose),
                CONSTRAINT fk_otp_user FOREIGN KEY (user_id) REFERENCES acount (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // 14. financial_settings
        console.log("   [14/24] Membuat tabel 'financial_settings'...");
        await connection.execute(`
            CREATE TABLE financial_settings (
                id INT PRIMARY KEY DEFAULT 1,
                ipl_nominal DECIMAL(12, 2) NOT NULL DEFAULT 200000.00,
                previous_balance DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        await connection.execute(`
            INSERT INTO financial_settings (id, ipl_nominal, previous_balance) 
            VALUES (1, 200000.00, 0.00)
            ON DUPLICATE KEY UPDATE ipl_nominal = VALUES(ipl_nominal);
        `);

        // 15. financial_ledger
        console.log("   [15/24] Membuat tabel 'financial_ledger'...");
        await connection.execute(`
            CREATE TABLE financial_ledger (
                id INT AUTO_INCREMENT PRIMARY KEY,
                type ENUM('in', 'out') NOT NULL,
                amount DECIMAL(12, 2) NOT NULL,
                source_type VARCHAR(100) NOT NULL,
                description TEXT NULL,
                receipt_file VARCHAR(255) NULL,
                transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_ledger_type (type),
                INDEX idx_ledger_date (transaction_date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // 16. surat_masuk
        console.log("   [16/24] Membuat tabel 'surat_masuk'...");
        await connection.execute(`
            CREATE TABLE surat_masuk (
                id INT AUTO_INCREMENT PRIMARY KEY,
                no_agenda VARCHAR(50) NOT NULL,
                tanggal_masuk DATETIME DEFAULT CURRENT_TIMESTAMP,
                instansi_pengirim VARCHAR(200) NOT NULL,
                perihal VARCHAR(200) NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // 17. surat_keluar
        console.log("   [17/24] Membuat tabel 'surat_keluar'...");
        await connection.execute(`
            CREATE TABLE surat_keluar (
                id INT AUTO_INCREMENT PRIMARY KEY,
                no_agenda VARCHAR(50) NOT NULL,
                tanggal_keluar DATETIME DEFAULT CURRENT_TIMESTAMP,
                penerima VARCHAR(200) NOT NULL,
                perihal VARCHAR(200) NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // 18. template_surat
        console.log("   [18/24] Membuat tabel 'template_surat'...");
        await connection.execute(`
            CREATE TABLE template_surat (
                id INT AUTO_INCREMENT PRIMARY KEY,
                judul VARCHAR(200) NOT NULL,
                deskripsi TEXT NULL,
                kategori VARCHAR(100) NULL,
                file_path VARCHAR(255) NOT NULL,
                original_name VARCHAR(255) NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // 19. bill_periods
        console.log("   [19/24] Membuat tabel 'bill_periods'...");
        await connection.execute(`
            CREATE TABLE bill_periods (
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
                CONSTRAINT fk_bill_periods_created_by FOREIGN KEY (created_by) REFERENCES acount (id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // 20. bills (family_id)
        console.log("   [20/24] Membuat tabel 'bills' (family_id)...");
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
                CONSTRAINT fk_bills_bill_period FOREIGN KEY (bill_period_id) REFERENCES bill_periods (id) ON DELETE RESTRICT,
                CONSTRAINT fk_bills_family FOREIGN KEY (family_id) REFERENCES family (id) ON DELETE RESTRICT,
                CONSTRAINT fk_bills_exempt_by FOREIGN KEY (exempt_by) REFERENCES acount (id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // 21. payments (family_id)
        console.log("   [21/24] Membuat tabel 'payments' (family_id)...");
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
                CONSTRAINT fk_payments_family FOREIGN KEY (family_id) REFERENCES family (id) ON DELETE RESTRICT,
                CONSTRAINT fk_payments_recorded_by FOREIGN KEY (recorded_by) REFERENCES acount (id) ON DELETE SET NULL,
                CONSTRAINT fk_payments_verified_by FOREIGN KEY (verified_by) REFERENCES acount (id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // 22. payment_bill_links
        console.log("   [22/24] Membuat tabel 'payment_bill_links'...");
        await connection.execute(`
            CREATE TABLE payment_bill_links (
                id INT AUTO_INCREMENT PRIMARY KEY,
                payment_id INT NOT NULL,
                bill_id INT NOT NULL,
                allocated_amount DECIMAL(12, 2) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_pbl_payment_id (payment_id),
                INDEX idx_pbl_bill_id (bill_id),
                CONSTRAINT fk_pbl_payment FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE CASCADE,
                CONSTRAINT fk_pbl_bill FOREIGN KEY (bill_id) REFERENCES bills (id) ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // 23. kas_contributions (family_id)
        console.log("   [23/24] Membuat tabel 'kas_contributions' (family_id)...");
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
                CONSTRAINT fk_kas_family FOREIGN KEY (family_id) REFERENCES family (id) ON DELETE RESTRICT,
                CONSTRAINT fk_kas_recorded_by FOREIGN KEY (recorded_by) REFERENCES acount (id) ON DELETE SET NULL,
                CONSTRAINT fk_kas_verified_by FOREIGN KEY (verified_by) REFERENCES acount (id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // 24. notifications
        console.log("   [24/24] Membuat tabel 'notifications'...");
        await connection.execute(`
            CREATE TABLE notifications (
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
                CONSTRAINT fk_notifications_account FOREIGN KEY (account_id) REFERENCES acount (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // -----------------------------------------------------------------
        // 4. Hidupkan Kembali Foreign Key Checks & Commit
        // -----------------------------------------------------------------
        await connection.query("SET FOREIGN_KEY_CHECKS = 1;");
        await connection.commit();

        console.log("\n===================================================================");
        console.log("🎉 SEMUA 24 TABEL SKEMA DATABASE BERHASIL DIRESET & DIBANGUN 100%!");
        console.log("===================================================================");

        return true;
    } catch (err) {
        await connection.rollback();
        console.error("\n❌ GAGAL INISIALISASI SKEMA DATABASE (Rollback dilakukan):", err);
        throw err;
    } finally {
        connection.release();
    }
}

// Eksekusi jika dipanggil via node
if (process.argv[1] && (process.argv[1].endsWith("20260824_init_complete_schema.js") || process.argv[1].includes("init_complete_schema"))) {
    up().then(() => {
        process.exit(0);
    }).catch(() => {
        process.exit(1);
    });
}
