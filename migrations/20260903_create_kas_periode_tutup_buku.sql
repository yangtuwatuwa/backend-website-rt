-- Serializes closing and all manual cash mutations, including the first closing.
CREATE TABLE IF NOT EXISTS kas_buku_lock (
    id TINYINT PRIMARY KEY,
    CONSTRAINT chk_kas_buku_lock_singleton CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO kas_buku_lock (id) VALUES (1);

CREATE TABLE IF NOT EXISTS kas_periode_tutup_buku (
    id INT AUTO_INCREMENT PRIMARY KEY,
    periode_mulai DATE NOT NULL,
    periode_selesai DATE NOT NULL,
    saldo_awal DECIMAL(20, 2) NOT NULL,
    total_pemasukan DECIMAL(20, 2) NOT NULL,
    total_pengeluaran DECIMAL(20, 2) NOT NULL,
    saldo_akhir DECIMAL(20, 2) NOT NULL,
    jumlah_transaksi INT UNSIGNED NOT NULL,
    ditutup_oleh INT NULL,
    ditutup_role VARCHAR(50) NOT NULL,
    ditutup_pada TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    keterangan TEXT NULL,
    created_by INT NULL,
    updated_by INT NULL,
    deleted_by INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME NULL,
    INDEX idx_kas_tutup_buku_active_cutoff (deleted_at, periode_selesai),
    CONSTRAINT fk_kas_tutup_actor FOREIGN KEY (ditutup_oleh) REFERENCES acount(id) ON DELETE SET NULL,
    CONSTRAINT fk_kas_tutup_created FOREIGN KEY (created_by) REFERENCES acount(id) ON DELETE SET NULL,
    CONSTRAINT fk_kas_tutup_updated FOREIGN KEY (updated_by) REFERENCES acount(id) ON DELETE SET NULL,
    CONSTRAINT fk_kas_tutup_deleted FOREIGN KEY (deleted_by) REFERENCES acount(id) ON DELETE SET NULL,
    CONSTRAINT chk_kas_tutup_dates CHECK (periode_mulai <= periode_selesai),
    CONSTRAINT chk_kas_tutup_totals CHECK (total_pemasukan >= 0 AND total_pengeluaran >= 0),
    CONSTRAINT chk_kas_tutup_balance CHECK (saldo_akhir = saldo_awal + total_pemasukan - total_pengeluaran)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
