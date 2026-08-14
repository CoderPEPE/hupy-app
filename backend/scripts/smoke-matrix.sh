#!/usr/bin/env bash
# Smoke test for the full (base, target) language matrix.
set -euo pipefail

cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

PORT=3996
export PORT

# Make sure no stale server answers the health check before ours is up.
lsof -iTCP:$PORT -sTCP:LISTEN -t 2>/dev/null | xargs -r kill || true
sleep 1

cargo run > /tmp/hupy-matrix.log 2>&1 &
trap 'lsof -iTCP:$PORT -sTCP:LISTEN -t 2>/dev/null | xargs -r kill || true' EXIT

for i in $(seq 1 60); do
  curl -s "http://localhost:$PORT/health" >/dev/null 2>&1 && break
  sleep 1
done

EMAIL="matrix-$(date +%s)@test.com"

echo "--- register (base=es, target=en) ---"
TOKEN=$(curl -s -X POST "http://localhost:$PORT/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"password123\",\"base_language\":\"es\",\"language\":\"en\"}" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')
curl -s "http://localhost:$PORT/api/auth/me" -H "Authorization: Bearer $TOKEN" \
  | python3 -c 'import sys,json; u=json.load(sys.stdin); print("  course:", u["base_language"], "->", u["language"])'

echo "--- planets (es -> en course) ---"
curl -s "http://localhost:$PORT/api/planets" -H "Authorization: Bearer $TOKEN" \
  | python3 -c '
import sys, json
ps = json.load(sys.stdin)
print("  planets:", len(ps), "base:", ps[0]["base_language"], "target:", ps[0]["language"])
print("  first:", ps[0]["title"], "-", ps[0]["subtitle"][:40])'

echo "--- planet detail pair (es->en: en=English target, pt=Spanish base) ---"
curl -s "http://localhost:$PORT/api/planets/a1111111-1111-4111-8111-111111111111" -H "Authorization: Bearer $TOKEN" \
  | python3 -c '
import sys, json
s = json.load(sys.stdin)["sentences"][0]
print("  target(en):", s["en"], "| base(pt):", s["pt"])'

echo "--- switch course to (es -> pt) ---"
curl -s -X POST "http://localhost:$PORT/api/auth/language" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"base_language":"es","language":"pt"}' \
  | python3 -c 'import sys,json; u=json.load(sys.stdin); print("  now:", u["base_language"], "->", u["language"])'

echo "--- planet detail (es->pt: pt=target, es=base) ---"
curl -s "http://localhost:$PORT/api/planets/c1111111-1111-4111-8111-111111111111" -H "Authorization: Bearer $TOKEN" \
  | python3 -c '
import sys, json
s = json.load(sys.stdin)["sentences"][0]
print("  target(en):", s["en"], "| base(pt):", s["pt"])'

echo "--- catalog counts per pair ---"
for pair in "pt en" "pt es" "en pt" "es en" "en es" "es pt"; do
  set -- $pair
  curl -s "http://localhost:$PORT/api/planets/catalog?base_language=$1&language=$2" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print('  $1 -> $2:', d['planets'], 'planets /', d['sentences'], 'sentences /', d['lessons'], 'lessons')"
done

echo "--- invalid pair rejected ---"
curl -s -o /dev/null -w "  register bad base: %{http_code}\n" -X POST "http://localhost:$PORT/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"bad@test.com\",\"password\":\"password123\",\"base_language\":\"xx\",\"language\":\"en\"}"
curl -s -o /dev/null -w "  register base==target: %{http_code}\n" -X POST "http://localhost:$PORT/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"bad2@test.com\",\"password\":\"password123\",\"base_language\":\"en\",\"language\":\"en\"}"
curl -s -o /dev/null -w "  switch base==target: %{http_code}\n" -X POST "http://localhost:$PORT/api/auth/language" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"base_language":"es","language":"es"}'

echo "--- scripted lessons exist for all new pairs ---"
for pid in a1111111-1111-4111-8111-111111111111 b1111111-1111-4111-8111-111111111111 c1111111-1111-4111-8111-111111111111; do
  curl -s "http://localhost:$PORT/api/planets/$pid/lesson" -H "Authorization: Bearer $TOKEN" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print('  $pid:', len(d['steps']), 'steps')"
done

echo "--- OK ---"
