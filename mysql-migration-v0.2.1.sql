-- =====================================================================
-- SEG DG DASHBOARD — Migration v0.2.1
-- Système de mise à jour automatique par Excel
-- =====================================================================
-- Rôle : étendre le schéma existant (sans supprimer de tables) pour
-- supporter les imports traçables, idempotents et annulables.
--
-- À exécuter une seule fois contre la base `seg_dashboard` :
--   mysql -u root -proot seg_dashboard < mysql-migration-v0.2.1.sql
-- =====================================================================

USE seg_dashboard;

-- ---------------------------------------------------------------------
-- 1. data_imports : traçabilité complète d'un import
--    (hash, taille, type, période, résultats, utilisateur, erreur, statut)
-- ---------------------------------------------------------------------
ALTER TABLE data_imports
  ADD COLUMN file_hash CHAR(64) NULL AFTER file_name,
  ADD COLUMN file_size BIGINT UNSIGNED NULL AFTER file_hash,
  ADD COLUMN import_type ENUM('excel_bd_fac','excel_bd_tech','excel_bd_recouv','excel_composite') NULL AFTER source_year,
  ADD COLUMN period_start DATE NULL AFTER source_year,
  ADD COLUMN period_end DATE NULL AFTER period_start,
  ADD COLUMN rows_new INT UNSIGNED NULL AFTER rows_count,
  ADD COLUMN rows_updated INT UNSIGNED NULL AFTER rows_new,
  ADD COLUMN user_name VARCHAR(120) NULL AFTER anomalies_count,
  ADD COLUMN error_message TEXT NULL AFTER user_name;

-- Hash unique : détecte le dépôt du même fichier déjà importé.
ALTER TABLE data_imports
  ADD UNIQUE KEY uq_import_hash (file_hash);

-- Les colonnes statut ne couvrent pas le cas rollback / mesuré.
ALTER TABLE data_imports
  MODIFY COLUMN status ENUM('pending','analyzing','validated','partial','failed','rolled_back') NOT NULL DEFAULT 'validated';

-- ---------------------------------------------------------------------
-- 2. data_quality_issues : précision des anomalies détectées
--    (colonne ciblée, type d'anomalie, valeur source brute)
-- ---------------------------------------------------------------------
ALTER TABLE data_quality_issues
  ADD COLUMN severity ENUM('info','warning','critical') NOT NULL DEFAULT 'info' AFTER category,
  ADD COLUMN field VARCHAR(80) NULL AFTER excel_row,
  ADD COLUMN issue_type VARCHAR(60) NULL AFTER sheet_name,
  ADD COLUMN source_value TEXT NULL AFTER excel_row;

-- ---------------------------------------------------------------------
-- Fin de migration v0.2.1
-- ---------------------------------------------------------------------