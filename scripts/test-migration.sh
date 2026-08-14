#!/bin/bash
# Apply migrations up to a target version on a scratch DB to surface SQL errors.
set -e
cd "$(dirname "$0")/.."
TARGET="${1:-2026-08-12-000002_sixty_planets}"
DB="hupy_mig_check"

dropdb --if-exists "$DB" >/dev/null 2>&1 || true
createdb "$DB"

for dir in backend/migrations/*/; do
  name=$(basename "$dir")
  echo "== $name"
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$dir/up.sql" >/dev/null
  if [ "$name" = "$TARGET" ]; then
    echo "reached $TARGET OK"
    break
  fi
done

echo "=== summary ==="
psql -q -d "$DB" -c "SELECT count(*) AS planets FROM planets;"
psql -q -d "$DB" -c "SELECT count(*) AS lessons FROM planet_lessons;"
psql -q -d "$DB" -c "SELECT count(*) AS sentences FROM planet_sentences;"
psql -q -d "$DB" -c "SELECT count(*) AS steps FROM lesson_steps;"
psql -q -d "$DB" -c "SELECT number, level, goal FROM planets WHERE base_language='pt' AND language='en' ORDER BY number LIMIT 12;"
dropdb --if-exists "$DB"
