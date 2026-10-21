-- V0.4 — Documents & Archives
CREATE TABLE IF NOT EXISTS documents (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  category ENUM('courriers','rapports','archives','officiels') NOT NULL DEFAULT 'rapports',
  file_type VARCHAR(20) NOT NULL DEFAULT 'PDF',
  file_path VARCHAR(500) NOT NULL,
  file_size INT UNSIGNED DEFAULT 0,
  agency_id INT UNSIGNED NULL,
  uploaded_by INT UNSIGNED NOT NULL,
  status ENUM('active','archived','pending') NOT NULL DEFAULT 'active',
  description TEXT NULL,
  metadata JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_doc_category (category),
  INDEX idx_doc_status (status),
  INDEX idx_doc_agency (agency_id),
  INDEX idx_doc_uploaded_by (uploaded_by),
  INDEX idx_doc_created (created_at),
  CONSTRAINT fk_doc_agency FOREIGN KEY(agency_id) REFERENCES agencies(id) ON DELETE SET NULL
) ENGINE=InnoDB;
