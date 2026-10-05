#!/usr/bin/env bash
# =============================================================================
# Restore a backup into a target instance — safely.
#
#   ./restore_mysql.sh --dump /path/or/s3-uri --target-host db.internal --verify
#
# Safety interlocks (all must pass):
#   * refuses to run without --confirm unless the target is a scratch restore host
#   * --verify restores into a scratch schema and checks row counts first
#   * never touches the source host (the dump is read-only)
# =============================================================================
set -Eeuo pipefail

DUMP=""
TARGET_HOST="${DB_HOST:-127.0.0.1}"
TARGET_PORT="${DB_PORT:-3306}"
TARGET_USER="${DB_USER:-lalita_migrate}"
TARGET_DB="${DB_NAME:-lalita_erp}"
VERIFY=0
CONFIRM=0

usage() { grep -E '^#( |$)' "$0" | sed 's/^# \{0,1\}//'; exit 1; }
log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dump) DUMP="$2"; shift 2 ;;
    --target-host) TARGET_HOST="$2"; shift 2 ;;
    --target-port) TARGET_PORT="$2"; shift 2 ;;
    --target-user) TARGET_USER="$2"; shift 2 ;;
    --database) TARGET_DB="$2"; shift 2 ;;
    --verify) VERIFY=1; shift ;;
    --confirm) CONFIRM=1; shift ;;
    --help|-h) usage ;;
    *) die "unknown argument: $1" ;;
  esac
done

[[ -n "$DUMP" ]] || usage
[[ -n "${MYSQL_PWD:-}" ]] || MYSQL_PWD="${DB_PASSWORD:?DB_PASSWORD is required}"

# Fetch from S3 when a URI is given, then verify the checksum before use.
LOCAL_DUMP="$DUMP"
if [[ "$DUMP" == s3://* ]]; then
  LOCAL_DUMP="/tmp/$(basename "$DUMP")"
  log "downloading ${DUMP} …"
  aws s3 cp "$DUMP" "$LOCAL_DUMP" --only-show-errors
  if aws s3 cp "${DUMP}.sha256" "${LOCAL_DUMP}.sha256" --only-show-errors 2>/dev/null; then
    ( cd /tmp && sha256sum -c "$(basename "${LOCAL_DUMP}.sha256")" ) || die "checksum mismatch — refusing to restore"
  else
    log "WARNING: no checksum file alongside the dump"
  fi
fi

if [[ "$CONFIRM" -ne 1 ]]; then
  die "refusing to restore without --confirm (target ${TARGET_HOST}/${TARGET_DB})"
fi

decode() {
  case "$LOCAL_DUMP" in
    *.gpg) gpg --batch --yes --decrypt "$LOCAL_DUMP" ;;
    *.gz)  gzip -dc "$LOCAL_DUMP" ;;
    *)     cat "$LOCAL_DUMP" ;;
  esac
}

mysql_cmd() {
  MYSQL_PWD="$MYSQL_PWD" mysql --host="$TARGET_HOST" --port="$TARGET_PORT" --user="$TARGET_USER" "$@"
}

if [[ "$VERIFY" -eq 1 ]]; then
  SCRATCH="${TARGET_DB}_verify_$(date -u +%s)"
  log "restoring into scratch schema ${SCRATCH} for verification …"
  mysql_cmd -e "CREATE DATABASE \`${SCRATCH}\`"
  decode | mysql_cmd "$SCRATCH" || die "scratch restore failed"
  for table in users projects plots customers bookings payments audit_logs; do
    count=$(mysql_cmd -N -B -e "SELECT COUNT(*) FROM \`${SCRATCH}\`.\`${table}\`" 2>/dev/null || echo 0)
    log "  ${table}: ${count} rows"
    [[ "$count" -gt 0 ]] || die "table ${table} is empty after restore — aborting"
  done
  mysql_cmd -e "DROP DATABASE \`${SCRATCH}\`"
  log "verification passed; scratch schema dropped"
fi

log "restoring into ${TARGET_HOST}/${TARGET_DB} …"
decode | mysql_cmd "$TARGET_DB" || die "restore failed"
log "restore complete — run the smoke checklist (sign-in, one booking read, one audit read)"
