-- Migration SQL: Add email_encrypted and email_blind_idx to acount table, drop plaintext email column
-- Target table: acount

ALTER TABLE `acount`
  ADD COLUMN `email_encrypted` VARBINARY(255) NOT NULL,
  ADD COLUMN `email_blind_idx` CHAR(64) NOT NULL,
  ADD CONSTRAINT `uq_email_blind_idx` UNIQUE (`email_blind_idx`),
  DROP COLUMN `email`;
