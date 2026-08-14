#!/usr/bin/env bash
# Full mirror: REPLACES the target database with an exact copy of the local one.
#
# Drops every object in the target's public schema, then restores a complete
# pg_dump (schema + all data, including users, messages and
# __diesel_schema_migrations). After this the target is byte-for-byte the same
# curriculum and dev data you have locally.
#
# The migration table comes along, so the deployed backend sees the migrations
# as already applied and won't re-run them on its next boot.
#
# Usage — open a tunnel in one terminal (no public access needed, no egress
# billing), then run this in another with the localhost URL it prints:
#
#   railway connect Postgres --tunnel-only
#   ./scripts/clone-to-railway.sh "postgres://postgres:PASS@127.0.0.1:PORT/railway"
#
# Railway's own DATABASE_URL points at .railway.internal, which only resolves
# from inside Railway — hence the tunnel. DATABASE_PUBLIC_URL works too, if you
# turn on Public Access.
#
# Set FORCE=1 to skip the confirmation prompt.
set -euo pipefail

LOCAL="${LOCAL_DATABASE_URL:-postgres://localhost:5432/hupy}"
TARGET="${1:-${RAILWAY_DATABASE_URL:-}}"

if [ -z "$TARGET" ]; then
    echo "usage: $0 <target-database-url>" >&2
    exit 1
fi

# Show what is about to be destroyed, using the target's own name/host rather
# than echoing the URL (it carries the password).
target_desc=$(psql "$TARGET" -qtAc "select current_database() || ' on ' || inet_server_addr()")
target_rows=$(psql "$TARGET" -qtAc "select coalesce(sum(n_live_tup),0) from pg_stat_user_tables")

if [ "${FORCE:-0}" != "1" ]; then
    echo "About to DROP everything in: $target_desc (~$target_rows rows)"
    echo "and replace it with a full copy of: $LOCAL"
    read -r -p "Type 'mirror' to continue: " reply
    [ "$reply" = "mirror" ] || { echo "aborted"; exit 1; }
fi

# --no-owner/--no-privileges: the local dump references the local role (nkt),
# which doesn't exist on Railway. Objects end up owned by the connecting user.
dump=$(mktemp -t hupy-mirror)
trap 'rm -f "$dump"' EXIT

echo "==> dumping $LOCAL"
pg_dump "$LOCAL" --no-owner --no-privileges --file="$dump"

echo "==> wiping target schema"
# IF EXISTS / IF NOT EXISTS: the Railway TCP proxy drops a connection now and
# then, and a re-run after one of those must not trip over a half-wiped target.
psql "$TARGET" -q -v ON_ERROR_STOP=1 \
    -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA IF NOT EXISTS public;'

echo "==> restoring"
psql "$TARGET" -q -o /dev/null -v ON_ERROR_STOP=1 -f "$dump"

# Prove it mirrored: exact counts per table, both sides, diffed.
echo "==> verifying"
counts_sql="select table_name, (xpath('/row/c/text()',
    query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name),
    false, true, '')))[1]::text::bigint as n
  from information_schema.tables
  where table_schema='public' and table_type='BASE TABLE' order by 1"

if diff <(psql "$LOCAL" -qtAF, -c "$counts_sql") \
        <(psql "$TARGET" -qtAF, -c "$counts_sql"); then
    echo "OK — target matches local, table for table"
else
    echo "MISMATCH — lines above are local (<) vs target (>)" >&2
    exit 1
fi
