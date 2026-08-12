# Deploying Huppy to production

This guide covers running the Huppy backend in production and pointing the
mobile app at it. It assumes you are deploying the API behind an HTTPS
reverse proxy on a single host.

## What you're deploying

| Piece | What it is |
|---|---|
| `backend/` | Rust + Axum API. Applies migrations on boot, then serves on `PORT` (default 3000). |
| `mobile/` | React Native app; a production build is pointed at the API via `EXPO_PUBLIC_API_URL`. |
| Postgres | Single database, owned by the backend. |

The backend is stateless except for two process-scoped in-memory rate-limit
buckets (per socket IP) — see [Scaling notes](#scaling-notes).

## 1. Environment variables

All configuration comes from the environment (`backend/.env` or the process
env — see `backend/src/config.rs` for the authoritative list).

| Variable | Required | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | **yes** | — | Postgres connection string, e.g. `postgres://user:pass@host:5432/huppy`. |
| `JWT_SECRET` | **yes** | — | HMAC secret for JWTs. Generate with `openssl rand -hex 32`. A value under 16 chars logs a warning on boot. Rotating it invalidates every session. |
| `OPENAI_API_KEY` | no | empty | Needed for Realtime voice sessions and TTS. The key never leaves the server. |
| `PORT` | no | `3000` | Port the HTTP server binds (all interfaces). |
| `CORS_ORIGIN` | no | allow-all | Set to your web client's origin if you serve a web app; native apps don't enforce CORS. |
| `TTS_MODEL` / `TTS_VOICE` | no | `gpt-4o-mini-tts` / `marin` | OpenAI speech model/voice used by `/api/tts`. |
| `TTS_CACHE_MAX_AGE_DAYS` | no | `30` | Generated clips are pruned after this many days, opportunistically on the next cache write. |
| `ACCESS_TOKEN_TTL_SECS` | no | `900` (15 min) | Access JWT lifetime. Short by design: the app silently refreshes it with the rotating refresh token, so a stolen JWT expires fast. |
| `REFRESH_TOKEN_TTL_SECS` | no | `2592000` (30 days) | Refresh-token lifetime. Lower it (e.g. 7 days) for stricter session hygiene; on expiry the user logs in again. |
| `DB_POOL_MAX_SIZE` | no | `10` | r2d2 connection pool size — roughly your expected concurrent requests. |
| `AUTH_RATE_MAX` / `AUTH_RATE_WINDOW_SECS` | no | `30` / `60` | Per-IP limit for `/api/auth/*` and the Realtime client-secret mint. |
| `TTS_RATE_MAX` / `TTS_RATE_WINDOW_SECS` | no | `120` / `60` | Per-IP limit for `/api/tts`. |
| `WRITE_RATE_MAX` / `WRITE_RATE_WINDOW_SECS` | no | `120` / `60` | One shared per-IP limit across the learning write endpoints (conversations, flashcards, planets progress/mastery). Reads are never throttled. |

Missing required variables make the process **fail fast at boot** with a
message naming the missing variable — a misconfigured deploy never limps
along half-configured.

## 2. Database

- **Postgres 13+** (the project is built and tested against Postgres 16).
- The backend runs `diesel` embedded migrations **on every boot**, so a
  deploy is: push new code → restart → migrations apply. For blue/green
  deploys against the same DB, run the new version's migration step once and
  then cut over; `diesel` records applied migrations in `__diesel_migrations`,
  so re-running is a no-op.
- Back up the database with your normal Postgres tooling (`pg_dump` /
  managed-service snapshots). The `tts_audio` cache table is the only
  high-volume table; it self-prunes via `TTS_CACHE_MAX_AGE_DAYS`.

## 3. Running the API

### Option A — Docker (recommended)

```bash
cp backend/.env.example .env          # set DATABASE_URL, JWT_SECRET, OPENAI_API_KEY
docker compose up --build -d
```

The root `docker-compose.yml` runs Postgres + the API, waits for the
database healthcheck, and restarts the API unless stopped. Health check:
`GET /health` → `200`.

### Option B — Bare metal

```bash
cd backend
cargo build --release
DATABASE_URL=... JWT_SECRET=... ./target/release/huppy-backend
```

Run it under a process supervisor (systemd, supervisord, a container
orchestrator). On `SIGTERM`/`SIGINT` the server drains in-flight requests
before exiting, so orchestrators can restart it without dropping users
mid-request.

## 4. Reverse proxy, TLS, and the rate limiter

Put the API behind an HTTPS proxy (nginx, Caddy, Cloudflare, a load
balancer). Two things matter:

1. **The rate limiter keys on the socket IP.** Behind a proxy, every client
   shares the proxy's IP and therefore one rate-limit bucket. The
   middleware reads the direct socket address (`ConnectInfo`), not
   `X-Forwarded-For`, deliberately: trusting a client-supplied header is how
   limiters get bypassed. If you run behind a proxy and want per-client
   limits, terminate TLS at the proxy and pass the real IP in a header you
   **overwrite** at the proxy (e.g. `X-Real-IP`), then change
   `middleware/ratelimit.rs` to read it. Do not add the header before the
   proxy can overwrite it.
2. **Set a generous proxy read timeout.** The API enforces its own 60-second
   request ceiling (returns `504 Gateway Timeout`); the proxy should not
   abort sooner on slow TTS/Realtime requests.

## 5. Pointing the mobile app at the API

- Set `EXPO_PUBLIC_API_URL` to the HTTPS URL in `mobile/.env` (see
  `mobile/.env.example`) and **rebuild the app** — the value is inlined at
  bundle time. EAS Build uploads `.env` files automatically, so the same
  file drives cloud builds.
- **Physical-device builds** use the `eas.json` profiles in `mobile/`:
  `development` (expo-dev-client, `ios.simulator: false` — flip to `true`
  for simulator builds), `preview` (internal/ad-hoc distribution), and
  `production` (store-ready, auto-incremented build number). First run
  requires `eas login`, `npx eas init`, and Apple signing credentials.
- **Verifying the reinstall key-rotation on a device:** build the
  `development` profile, install it, temporarily add
  `console.info('[storage][verify] key fingerprint:', key.slice(0, 12));`
  to `initSecureStorageInner()` in `mobile/src/storage.ts`, launch via
  `npx expo start --dev-client` (device on the same Wi-Fi; on first launch
  pick your machine's packager entry in the dev launcher), and confirm the
  fingerprint **changes** after deleting and reinstalling the app (the
  Keychain key survives uninstall; the encrypted store file does not).
- **Production builds include `expo-dev-client`** (its dev UI only activates
  in debug builds). Before a store submission, confirm the release build
  boots straight into the app; teams that prefer to strip it can exclude the
  package from the production profile's dependency set.
- The app shows a full-screen offline state when `/health` is unreachable
  and recovers automatically, so a redeploying backend reads as a brief
  offline screen rather than an error wall.
- `app.json` enables cleartext HTTP for development (`usesCleartextTraffic`
  on Android). It is harmless with an HTTPS `EXPO_PUBLIC_API_URL` (the app
  only talks to that URL), but remove it for a release build if you prefer
  to forbid cleartext outright.

## 6. Observability

- Structured logs go to stdout via `tracing` (level controlled by
  `RUST_LOG`, default `huppy_backend=debug,tower_http=debug` — use
  `RUST_LOG=huppy_backend=info` in production to cut the noise).
- Every request is traced by `TraceLayer` (method, path, status, latency),
  which is all most deployments need; ship stdout to your log collector.
- Internal errors are logged in full server-side but returned to clients as
  a generic `{"error":"internal server error"}` with a `500` — no database
  or upstream details leak to clients.

## 7. Security checklist

- [ ] `JWT_SECRET` is a long random value, never the default, never committed.
- [ ] Access tokens are short-lived and refresh tokens rotate (this is the default; the `ACCESS_TOKEN_TTL_SECS` / `REFRESH_TOKEN_TTL_SECS` env vars control it).
- [ ] The refresh-token table lives in the same Postgres as everything else — if you back up the DB, the tokens (as hashes) come along. Sessions are server-revocable via `/api/auth/logout`.
- [ ] The mobile app encrypts its stored auth tokens with a device-bound key: the AES key lives in the iOS Keychain / Android Keystore with `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (readable only while unlocked), and Android auto-backup is disabled (`android.allowBackup: false`), so neither iCloud nor Android backup can restore a session to another device. On iOS the keychain items are pinned to an explicit access group (`$(AppIdentifierPrefix)com.conjuntos.huppy` via `ios.entitlements`), so the key survives re-signing and certificate/profile rotation within the same team — a team change (different AppIdentifierPrefix) moves keychain items and forces re-login, which no entitlement can bridge. On reinstall the old key is never reused: the MMKV file dies with the app container while the iOS Keychain item can survive uninstall, and app boot detects that stale key and rotates to a fresh one. Support can also force a re-key on demand via the exported `rotateSecureStorageKey()` (re-encrypts the live store under a fresh key while preserving the session). A backup that keeps the MMKV file but loses the keychain item forces a fresh login rather than a plaintext downgrade.
- [ ] `OPENAI_API_KEY` only exists server-side.
- [ ] The API is only reachable over HTTPS in production.
- [ ] `CORS_ORIGIN` is set if a web client exists.
- [ ] Rate limits are tuned for your traffic (`AUTH_RATE_MAX`,
      `TTS_RATE_MAX`, `WRITE_RATE_MAX`).
- [ ] Passwords are Argon2id-hashed server-side; login does a dummy hash for
      unknown emails so response timing can't enumerate accounts.
- [ ] 500 responses are generic (this is the default behavior).

## 8. Scaling notes

- The rate limiter is in-memory and per-process. It is correct for a
  **single API instance**; if you scale horizontally, swap
  `middleware/ratelimit.rs` for a shared store (Redis) — the `RateLimiter`
  trait boundary is the seam.
- Refresh tokens live in Postgres (hashed), so sessions survive a restart
  and horizontal scale-out — every instance can validate and rotate them
  against the shared database. Only `JWT_SECRET` must be identical across
  instances (a rotating secret also invalidates refresh tokens only at their
  next use, not retroactively, which is a property worth knowing).
- Multiple API instances are safe as long as they share one database and one `JWT_SECRET`.
- The Realtime and TTS outbound calls use a single pooled HTTP client with
  timeouts (10 s connect / 60 s request), so a slow upstream fails fast
  instead of piling up connections.

## 9. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Process exits immediately on boot | A required env var is missing — the error message names it. |
| Migrations fail on boot | Database unreachable, or the role lacks DDL rights. |
| Everything returns 429 | All traffic shares one IP (proxy) — see §4. |
| Realtime sessions fail to start | `OPENAI_API_KEY` missing/invalid, or the chosen voice is not in `tutor_voices`. |
| App stuck on the offline screen | `/health` unreachable — check DNS/TLS/firewall, then it self-clears. |
| App bounces to login mid-session | The refresh token was revoked or expired — either an explicit logout elsewhere, a reuse-detection event (a stolen token was replayed, revoking the family), or `REFRESH_TOKEN_TTL_SECS` elapsed. Log in again. |
| `POST /api/auth/refresh` returns 401 | The presented token was already rotated (single-use), revoked by logout, or expired. The client handles this automatically; a manual curl test must use the *latest* refresh token from the last response. |
