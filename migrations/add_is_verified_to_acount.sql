-- =================================================================================
-- MIGRATION: ADD is_verified COLUMN TO acount TABLE
-- =================================================================================

ALTER TABLE `acount` 
ADD COLUMN `is_verified` TINYINT(1) NOT NULL DEFAULT 0 AFTER `must_change_password`;

-- Set default is_verified = 1 for existing RT, Admin, and Staff accounts
UPDATE `acount` SET `is_verified` = 1 WHERE `role` IN ('rt', 'sekertaris', 'bendahara', 'admin');
