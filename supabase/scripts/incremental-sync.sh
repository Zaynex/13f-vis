#!/bin/bash
# Incremental sync script for syncing local database to Supabase
# Usage: ./scripts/incremental-sync.sh [full]
#   - Without args: incremental sync (only changed since last sync)
#   - With "full" arg: full sync (ignores last sync timestamp)

set -e

# Configuration
LOCAL_DB="${DATABASE_URL:-postgresql://vincent@localhost:5432/sec13f}"
SUPABASE_DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:Lcqfuwqmtk2fpMNA@db.ioayavjtebivvycfcgzs.supabase.co:5432/postgres}"
SYNC_STATE_FILE=".supabase_sync_last_timestamp"

# Find psql and pg_dump (Homebrew macOS)
PSQL="/opt/homebrew/Cellar/postgresql@16/16.13/bin/psql"
PG_DUMP="/opt/homebrew/Cellar/postgresql@16/16.13/bin/pg_dump"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Get last sync timestamp
get_last_sync() {
    if [ -f "$SYNC_STATE_FILE" ]; then
        cat "$SYNC_STATE_FILE"
    else
        echo ""
    fi
}

# Save sync timestamp
save_sync_timestamp() {
    date -u +"%Y-%m-%d %H:%M:%S" > "$SYNC_STATE_FILE"
}

# Full sync
do_full_sync() {
    log_info "Starting FULL sync (all data)..."

    # Export all data
    log_info "Exporting all data from local database..."
    $PG_DUMP --file=dump_full.sql --clean --if-exists --inserts "$LOCAL_DB"

    # Import to Supabase
    log_info "Importing to Supabase..."
    $PSQL "$SUPABASE_DB_URL" < dump_full.sql

    save_sync_timestamp
    log_info "Full sync complete!"
}

# Incremental sync
do_incremental_sync() {
    local last_sync=$(get_last_sync)

    if [ -z "$last_sync" ]; then
        log_warn "No previous sync found. Run './scripts/incremental-sync.sh full' for full sync."
        exit 1
    fi

    log_info "Starting INCREMENTAL sync (since: $last_sync)..."

    # Export only changed records (using updatedAt for all tables)
    log_info "Exporting changed records from local database..."

    # Create a temp file with the incremental dump
    $PG_DUMP \
        --file=dump_incremental.sql \
        --clean --if-exists --inserts \
        --where="\"updatedAt\" > '$last_sync'" \
        "$LOCAL_DB" || true

    # Check if there are any changes
    if [ ! -s dump_incremental.sql ] || [ $(wc -l < dump_incremental.sql) -lt 10 ]; then
        log_info "No changes found since last sync."
        return
    fi

    # Import to Supabase
    log_info "Importing changes to Supabase..."
    $PSQL "$SUPABASE_DB_URL" < dump_incremental.sql || log_warn "Some changes may have failed (OK if duplicate key)"

    save_sync_timestamp
    log_info "Incremental sync complete!"
}

# Main
case "${1:-}" in
    full)
        do_full_sync
        ;;
    *)
        do_incremental_sync
        ;;
esac
