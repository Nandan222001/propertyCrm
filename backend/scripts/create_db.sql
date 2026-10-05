-- ---------------------------------------------------------------------------
-- MySQL provisioning for the Lalita ERP API (least-privilege, TLS required).
--
-- Run once per environment as a DBA (root), then store the generated password
-- in the secret manager as DB_PASSWORD:
--
--   mysql -u root -p < scripts/create_db.sql
--
-- Two accounts are created on purpose:
--   * lalita_app   — the API runtime account: DML on business tables only,
--                    INSERT+SELECT on append-only audit tables, no DDL;
--   * lalita_migrate — used only by CI/CD to run Alembic migrations (DDL).
-- The runtime account can never alter or drop schema objects, and cannot
-- rewrite or delete audit evidence.
-- ---------------------------------------------------------------------------

CREATE DATABASE IF NOT EXISTS `lalita_erp`
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

-- Runtime account (replace the host list with your private subnet CIDRs).
CREATE USER IF NOT EXISTS 'lalita_app'@'%'
    IDENTIFIED BY 'CHANGE_ME_STRONG_RANDOM_PASSWORD'
    REQUIRE SSL
    WITH MAX_QUERIES_PER_HOUR 200000
         MAX_USER_CONNECTIONS 200
         PASSWORD EXPIRE INTERVAL 180 DAY;

-- Migration account: DDL only, used by the deploy pipeline.
CREATE USER IF NOT EXISTS 'lalita_migrate'@'%'
    IDENTIFIED BY 'CHANGE_ME_OTHER_STRONG_RANDOM_PASSWORD'
    REQUIRE SSL
    WITH MAX_USER_CONNECTIONS 20;

-- ------------------------------------------------------------------ app grants
-- Business tables: full DML (soft deletes are UPDATEs, never DELETEs).
GRANT SELECT, INSERT, UPDATE, DELETE ON `lalita_erp`.`users`                  TO 'lalita_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `lalita_erp`.`user_permission_grants` TO 'lalita_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `lalita_erp`.`auth_tokens`            TO 'lalita_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `lalita_erp`.`customers`              TO 'lalita_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `lalita_erp`.`customer_consents`      TO 'lalita_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `lalita_erp`.`projects`               TO 'lalita_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `lalita_erp`.`plots`                  TO 'lalita_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `lalita_erp`.`bookings`               TO 'lalita_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `lalita_erp`.`booking_status_history` TO 'lalita_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `lalita_erp`.`payments`               TO 'lalita_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `lalita_erp`.`receipts`               TO 'lalita_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `lalita_erp`.`agents`                 TO 'lalita_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `lalita_erp`.`commissions`            TO 'lalita_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `lalita_erp`.`documents`              TO 'lalita_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `lalita_erp`.`notifications`          TO 'lalita_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `lalita_erp`.`app_settings`           TO 'lalita_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `lalita_erp`.`data_subject_requests`  TO 'lalita_app'@'%';

-- Append-only evidence: the runtime account may add rows and read them, but
-- never update or delete them (audit retention is an operational job that runs
-- with a separate privileged connection).
GRANT SELECT, INSERT ON `lalita_erp`.`audit_logs`      TO 'lalita_app'@'%';
GRANT SELECT, INSERT ON `lalita_erp`.`security_events` TO 'lalita_app'@'%';
GRANT SELECT, INSERT ON `lalita_erp`.`login_attempts`  TO 'lalita_app'@'%';
-- Read-only view for the superset of what the app needs to introspect.
GRANT SELECT ON `lalita_erp`.`alembic_version` TO 'lalita_app'@'%';

-- ------------------------------------------------------------------ migrate
GRANT ALL PRIVILEGES ON `lalita_erp`.* TO 'lalita_migrate'@'%';

FLUSH PRIVILEGES;

-- Verification queries for a security audit:
--   SHOW GRANTS FOR 'lalita_app'@'%';
--   SELECT user, host, ssl_type FROM mysql.user WHERE user LIKE 'lalita%';
