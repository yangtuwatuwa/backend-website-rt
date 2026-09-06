-- Dokumentasi urutan migrasi production. Runner JS melakukan verifikasi wajib
-- sebelum DROP jenis; jangan menjalankan potongan terakhir secara terpisah.
CREATE TABLE IF NOT EXISTS surat_kategori (
    id INT PRIMARY KEY AUTO_INCREMENT,
    nama_kategori VARCHAR(150) NOT NULL UNIQUE,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 999,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE letter
    ADD COLUMN kategori_id INT NULL AFTER family_id,
    ADD COLUMN nama_lengkap VARCHAR(150) NULL,
    ADD COLUMN jenis_kelamin VARCHAR(20) NULL,
    ADD COLUMN tempat_lahir VARCHAR(100) NULL,
    ADD COLUMN tanggal_lahir DATE NULL,
    ADD COLUMN no_ktp VARCHAR(20) NULL,
    ADD COLUMN alamat TEXT NULL,
    ADD COLUMN agama VARCHAR(50) NULL,
    ADD COLUMN pekerjaan VARCHAR(100) NULL,
    ADD COLUMN kewarganegaraan VARCHAR(50) NULL,
    ADD COLUMN approved_by INT NULL,
    ADD COLUMN approved_at DATETIME NULL,
    ADD INDEX idx_letter_kategori_id (kategori_id),
    ADD INDEX idx_letter_created_at (created_at),
    ADD CONSTRAINT fk_letter_kategori FOREIGN KEY (kategori_id) REFERENCES surat_kategori(id),
    ADD CONSTRAINT fk_letter_approved_by FOREIGN KEY (approved_by) REFERENCES acount(id) ON DELETE SET NULL;

INSERT INTO surat_kategori (nama_kategori)
SELECT DISTINCT jenis FROM letter WHERE jenis IS NOT NULL;

UPDATE letter l
JOIN surat_kategori k ON k.nama_kategori = l.jenis
SET l.kategori_id = k.id
WHERE l.kategori_id IS NULL;

-- WAJIB menghasilkan 0. Runner JS melempar error dan berhenti jika tidak 0.
SELECT COUNT(*) AS unmapped_letter_count FROM letter WHERE kategori_id IS NULL;

ALTER TABLE letter MODIFY COLUMN kategori_id INT NOT NULL;
ALTER TABLE letter DROP COLUMN jenis;
