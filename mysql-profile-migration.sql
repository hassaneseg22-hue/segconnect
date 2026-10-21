-- =====================================================================
-- SEG DG DASHBOARD - Migration Profil Utilisateur
-- Extension du schéma pour le profil utilisateur complet :
--   * users.pending_email / users.email_verified_at / users.avatar /
--     users.profile_updated_at
--   * table email_change_tokens (validation du changement d'email)
--
-- À n'exécuter que sur une base neuve (avant la création d'utilisateurs) :
--   mysql -u root -proot seg_dashboard < mysql-profile-migration.sql
-- Sur la base courante (seg_dashboard), ces objets existent déjà (vérifié).
-- =====================================================================

USE seg_dashboard;

-- ---------------------------------------------------------------------
-- 1. Colonnes complémentaires de `users`
-- ---------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN pending_email VARCHAR(255) NULL AFTER email,
  ADD COLUMN email_verified_at DATETIME NULL AFTER pending_email,
  ADD COLUMN avatar VARCHAR(500) NULL AFTER job_title,
  ADD COLUMN profile_updated_at DATETIME NULL AFTER updated_at;

-- Index pour la recherche de disponibilité d'un email en attente.
-- (MySQL 8 n'accepte pas IF NOT EXISTS sur CREATE INDEX :
--  sur une base neuve, exécuter : CREATE INDEX idx_users_pending_email ON users (pending_email);)

-- ---------------------------------------------------------------------
-- 2. Tokens de changement d'email (preuve de possession de la boîte)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_change_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  new_email VARCHAR(255) NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME DEFAULT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY token_hash (token_hash),
  KEY idx_email_change_user (user_id),
  KEY idx_email_change_email (new_email),
  KEY idx_email_change_expiry (expires_at),
  CONSTRAINT fk_email_change_user FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;