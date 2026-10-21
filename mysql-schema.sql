CREATE DATABASE IF NOT EXISTS seg_dashboard CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE seg_dashboard;

CREATE TABLE IF NOT EXISTS agencies (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, code VARCHAR(20) NOT NULL UNIQUE, name VARCHAR(120) NOT NULL UNIQUE, active TINYINT(1) NOT NULL DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS client_types (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, code VARCHAR(20) NOT NULL UNIQUE, name VARCHAR(120) NOT NULL UNIQUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS data_imports (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, file_name VARCHAR(255) NOT NULL, source_year SMALLINT, imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, status ENUM('validated','partial','failed') NOT NULL DEFAULT 'validated', rows_count INT UNSIGNED DEFAULT 0, anomalies_count INT UNSIGNED DEFAULT 0, metadata JSON NULL) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS facturation_monthly (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, import_id BIGINT UNSIGNED NULL, period_month DATE NOT NULL, agency_id INT UNSIGNED NOT NULL, client_type_id INT UNSIGNED NOT NULL, subscribers_forfait DECIMAL(18,2) NULL, subscribers_mesure DECIMAL(18,2) NULL, subscribers_total DECIMAL(18,2) NULL, volume_consume_forfait DECIMAL(18,2) NULL, volume_facture_forfait DECIMAL(18,2) NULL, volume_consume_mesure DECIMAL(18,2) NULL, volume_facture_mesure DECIMAL(18,2) NULL, volume_consume_total DECIMAL(18,2) NULL, volume_facture_total DECIMAL(18,2) NULL, amount_forfait DECIMAL(20,2) NULL, amount_mesure DECIMAL(20,2) NULL, amount_total DECIMAL(20,2) NULL, amount_penalty DECIMAL(20,2) NULL, amount_paid DECIMAL(20,2) NULL, balance_due DECIMAL(20,2) NULL, recovery_rate DECIMAL(9,6) NULL, source_file VARCHAR(255), source_row INT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_fac (period_month,agency_id,client_type_id), CONSTRAINT fk_fac_import FOREIGN KEY(import_id) REFERENCES data_imports(id), CONSTRAINT fk_fac_agency FOREIGN KEY(agency_id) REFERENCES agencies(id), CONSTRAINT fk_fac_client FOREIGN KEY(client_type_id) REFERENCES client_types(id)) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS technique_monthly (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, import_id BIGINT UNSIGNED NULL, period_month DATE NOT NULL, agency_id INT UNSIGNED NOT NULL, volume_produced DECIMAL(20,2) NULL, volume_consumed DECIMAL(20,2) NULL, volume_billed DECIMAL(20,2) NULL, network_yield DECIMAL(9,6) NULL, billing_ratio DECIMAL(9,6) NULL, source_file VARCHAR(255), source_row INT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_tech (period_month,agency_id), CONSTRAINT fk_tech_import FOREIGN KEY(import_id) REFERENCES data_imports(id), CONSTRAINT fk_tech_agency FOREIGN KEY(agency_id) REFERENCES agencies(id)) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS recouvrement_monthly (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, import_id BIGINT UNSIGNED NULL, period_month DATE NOT NULL, agency_id INT UNSIGNED NOT NULL, client_type_id INT UNSIGNED NOT NULL, amount_forfait DECIMAL(20,2) NULL, amount_mesure DECIMAL(20,2) NULL, amount_total DECIMAL(20,2) NULL, amount_penalty DECIMAL(20,2) NULL, amount_paid DECIMAL(20,2) NULL, balance_due DECIMAL(20,2) NULL, amount_paid_updated DECIMAL(20,2) NULL, balance_due_updated DECIMAL(20,2) NULL, recovery_rate DECIMAL(9,6) NULL, recovery_rate_updated DECIMAL(9,6) NULL, evolution DECIMAL(9,6) NULL, source_file VARCHAR(255), source_row INT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_rec (period_month,agency_id,client_type_id), CONSTRAINT fk_rec_import FOREIGN KEY(import_id) REFERENCES data_imports(id), CONSTRAINT fk_rec_agency FOREIGN KEY(agency_id) REFERENCES agencies(id), CONSTRAINT fk_rec_client FOREIGN KEY(client_type_id) REFERENCES client_types(id)) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS data_quality_issues (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, import_id BIGINT UNSIGNED NULL, severity ENUM('info','warning','critical') NOT NULL, category VARCHAR(80) NOT NULL, message TEXT NOT NULL, sheet_name VARCHAR(120), excel_row INT, resolved TINYINT(1) NOT NULL DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, CONSTRAINT fk_issue_import FOREIGN KEY(import_id) REFERENCES data_imports(id)) ENGINE=InnoDB;
CREATE INDEX idx_fac_period_agency ON facturation_monthly(period_month,agency_id);
CREATE INDEX idx_tech_period_agency ON technique_monthly(period_month,agency_id);
CREATE INDEX idx_rec_period_agency ON recouvrement_monthly(period_month,agency_id);

-- V0.3 — Centre de Notifications DG
CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  type ENUM('critical','warning','info','success') NOT NULL,
  category VARCHAR(80) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  source VARCHAR(100),
  severity_score INT DEFAULT 0,
  target_url VARCHAR(500),
  metadata JSON NULL,
  is_read TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP NULL,
  INDEX idx_notif_read (is_read, created_at),
  INDEX idx_notif_type (type)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notification_settings (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  key_name VARCHAR(80) NOT NULL UNIQUE,
  label VARCHAR(150),
  value_type ENUM('number','percent_points','percent','boolean','string') NOT NULL DEFAULT 'number',
  value DECIMAL(12,4),
  boolean_value TINYINT(1) NULL,
  string_value VARCHAR(255) NULL,
  description VARCHAR(255),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO notification_settings(key_name,label,value_type,value,description) VALUES
 ('recouvrement.critical','Seuil recouvrement critique','percent',0.78,'En dessous de ce seuil => recouvrement critique'),
 ('recouvrement.warning','Seuil recouvrement attention','percent',0.82,'En dessous de ce seuil => attention'),
 ('recouvrement.variation','Variation recouvrement déclenchant une alerte','percent_points',0.05,'Variation (en points) au-delà de laquelle notifier'),
 ('technique.yield_max','Seuil rendement réseau supérieur à contrôler','percent',1.00,'Valeur de rendement dépassant ce seuil => à contrôler'),
 ('technique.yield_anomaly','Écart rendement déclenchant un contrôle','percent_points',0.15,'Écart significatif du rendement (>100% ou <0)'),
 ('commercial.revenue_delta','Croissance CA déclenchant une info','percent',0.05,'Variation du CA au-delà de laquelle informer'),
 ('commercial.impayes_delta','Croissance impayés déclenchant une alerte','percent',0.08,'Variation des impayés au-delà de laquelle alerter')
ON DUPLICATE KEY UPDATE label=VALUES(label),description=VALUES(description);
