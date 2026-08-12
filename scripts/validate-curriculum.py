"""Quick sanity checks on the generated curriculum migration."""
import re
import sys

SQL = "backend/migrations/2026-08-12-000002_sixty_planets/up.sql"

uuid_re = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")

sql = open(SQL).read()
uuids = uuid_re.findall(sql)
bad = [u for u in uuids if len(u) != 36]
print("uuid count:", len(uuids), "bad:", len(bad))
print("unique:", len(set(uuids)))

n_planets = sql.count("'::jsonb, 0.8,")
print("planet rows:", n_planets, "(expect 312)")

row_re = re.compile(r"^\('[0-9a-f-]+', ", re.M)
all_rows = row_re.findall(sql)
print("total uuid rows:", len(all_rows), "(expect 2808)")

step_re = re.compile(r"^\('[0-9a-f-]+', [1-4], '(teach|repeat|question|praise)'", re.M)
print("step rows:", len(step_re.findall(sql)), "(expect 1248)")

block_re = re.compile(r"^    \((10|[1-9]), '", re.M)
print("block template rows:", len(block_re.findall(sql)), "(expect 10)")

sys.exit(0 if not bad else 1)
