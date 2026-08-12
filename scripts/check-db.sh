#!/bin/bash
# Inspect the current huppy database state.
set -e
cd "$(dirname "$0")/.."

echo "=== migrations applied (last 5) ==="
psql -q -d huppy -c "SELECT version FROM __diesel_schema_migrations ORDER BY version DESC LIMIT 5;"

echo "=== planets per course ==="
psql -q -d huppy -c "SELECT base_language, language, count(*) FROM planets GROUP BY 1,2 ORDER BY 1,2;"

echo "=== sentences per planet (pt,en) ==="
psql -q -d huppy -c "SELECT p.number, count(s.id) FROM planets p LEFT JOIN planet_sentences s ON s.planet_id = p.id WHERE p.base_language='pt' AND p.language='en' GROUP BY p.number ORDER BY p.number;"

echo "=== lessons per planet (pt,en) ==="
psql -q -d huppy -c "SELECT p.number, count(l.id) FROM planets p LEFT JOIN planet_lessons l ON l.planet_id = p.id WHERE p.base_language='pt' AND p.language='en' GROUP BY p.number ORDER BY p.number;"
