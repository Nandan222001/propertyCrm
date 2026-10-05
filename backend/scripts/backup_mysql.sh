#!/usr/bin/env bash
# =============================================================================
# Encrypted logical backup of the ERP database.
#
#   ./backup_mysql.sh --database lalita_erp --out /var/backups/lalita
#
# Produces   <out>/<date>/<db>.sql.gz.gpg  and  .sha256
# Uploads    s3://$BACKUP_BUCKET/<env>/mysql/<date>/   (SSE-KMS)
# Requires   mysqldump, gzip, sha256sum, gpg, awscli (all optional except dump)
#
# Exit codes: 0 ok · 1 usage · 2 dump failed · 3 encryption missing · 4 upload failed
# =============================================================================
set -Eeuo pipefail

DATABASE="${DB_NAME:-lalita_erp}"
OUT_DIR="${BACKUP_DIR:-/var/backups/lalita}"
BUCKET="${BACKUP_BUCKET:-}"
ENVIRONMENT="${ENVIRONMENT:-local}"
RETENTION_DAYS="${LOCAL_RETENTION_DAYS:-7}"
GPG_RECIPIENT="${BACKUP_GPG_RECIPIENT:-}"
TIMESTAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"

usage() {
  grep -E '^#( |$)' "$0" | sed 's/^# \{0,1\}//'
  exit 1
}
log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }
die() { log "ERROR: $*"; exit "${2:-1}"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --database) DATABASE="$2"; shift 2 ;;
    --out) OUT_DIR="$2"; shift 2 ;;
    --bucket) BUCKET="$2"; shift 2 ;;
    --help|-h) usage ;;
    *) die "unknown argument: $1" 1 ;;
  esac
done

command -v mysqldump >/dev/null || die "mysqldump not found" 1
if [[ -n "$BUCKET" ]]; then
  command -v aws >/dev/null || die "awscli not found but --bucket was given" 1
fi

DAY_DIR="${OUT_DIR}/$(date -u +%Y-%m-%d)"
mkdir -p "$DAY_DIR"
DUMP="${DAY_DIR}/${DATABASE}_${TIMESTAMP}.sql.gz"

# --single-transaction keeps InnoDB consistent without locking writers; routines
# and triggers are required for a faithful restore; --set-gtid-purged=OFF keeps
# the dump portable to a fresh instance.
log "dumping ${DATABASE} …"
MYSQL_PWD="${DB_PASSWORD:?DB_PASSWORD is required}" mysqldump \
  --host="${DB_HOST:-127.0.0.1}" --port="${DB_PORT:-3306}" \
  --user="${DB_USER:-lalita_backup}" \
  --single-transaction --routines --triggers --events \
  --set-gtid-purged=OFF --no-tablespaces --hex-blob \
  --default-character-set=utf8mb4 \
  "$DATABASE" | gzip -9 > "${DUMP}" || die "mysqldump failed" 2

if [[ -n "$GPG_RECIPIENT" ]]; then
  command -v gpg >/dev/null || die "gpg not found but BACKUP_GPG_RECIPIENT is set" 3
  log "encrypting …"
  gpg --batch --yes --trust-model always --encrypt --recipient "$GPG_RECIPIENT" \
      --output "${DUMP}.gpg" "${DUMP}"
  shred -u "${DUMP}" 2>/dev/null || rm -f "${DUMP}"
  ARTIFACT="${DUMP}.gpg"
else
  # Refuse to leave a plaintext dump of PII on disk outside local development.
  [[ "$ENVIRONMENT" == "local" ]] || die "BACKUP_GPG_RECIPIENT must be set outside local" 3
  ARTIFACT="${DUMP}"
fi

sha256sum "$ARTIFACT" > "${ARTIFACT}.sha256"

if [[ -n "$BUCKET" ]]; then
  PREFIX="${ENVIRONMENT}/mysql/$(date -u +%Y-%m-%d)"
  log "uploading to s3://${BUCKET}/${PREFIX}/ …"
  aws s3 cp "$ARTIFACT" "s3://${BUCKET}/${PREFIX}/" \
      --sse aws:kms --only-show-errors || die "upload failed" 4
  aws s3 cp "${ARTIFACT}.sha256" "s3://${BUCKET}/${PREFIX}/" \
      --sse aws:kms --only-show-errors || die "checksum upload failed" 4
  aws s3api head-object --bucket "$BUCKET" --key "${PREFIX}/$(basename "$ARTIFACT")" >/dev/null \
      || die "upload verification failed" 4
fi

find "$OUT_DIR" -type f -mtime "+${RETENTION_DAYS}" -delete 2>/dev/null || true
log "done: $(basename "$ARTIFACT") ($(du -h "$ARTIFACT" | cut -f1))"
