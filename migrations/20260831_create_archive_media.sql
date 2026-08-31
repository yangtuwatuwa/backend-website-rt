CREATE TABLE IF NOT EXISTS `archive_media` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `judul` VARCHAR(200) NOT NULL,
    `kategori` VARCHAR(100) NOT NULL,
    `media_type` ENUM('image', 'video') NOT NULL,
    `mime_type` VARCHAR(100) NOT NULL,
    `file_path` VARCHAR(255) NOT NULL,
    `original_name` VARCHAR(255) NOT NULL,
    `file_size` BIGINT UNSIGNED NOT NULL,
    `uploaded_by` INT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_archive_media_created_at` (`created_at`),
    INDEX `idx_archive_media_category` (`kategori`),
    INDEX `idx_archive_media_type` (`media_type`),
    CONSTRAINT `fk_archive_media_uploader` FOREIGN KEY (`uploaded_by`)
        REFERENCES `acount` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
