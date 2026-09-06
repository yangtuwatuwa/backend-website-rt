ALTER TABLE surat_kategori
    ADD COLUMN sort_order INT NOT NULL DEFAULT 999 AFTER is_active;

-- Pertahankan record lama untuk integritas FK letter, tetapi sembunyikan dari dropdown.
UPDATE surat_kategori SET is_active = 0;

INSERT INTO surat_kategori (nama_kategori, is_active, sort_order) VALUES
    ('Membuat Surat Keterangan Domisili', 1, 1),
    ('Membuat Surat Pengantar Nikah / Rujukan Kelurahan', 1, 2),
    ('Membuat Surat Keterangan Tidak Mampu (SKTM)', 1, 3),
    ('Membuat surat Izin Keramaian', 1, 4),
    ('Lain-Lain', 1, 5)
ON DUPLICATE KEY UPDATE
    is_active = VALUES(is_active),
    sort_order = VALUES(sort_order);
