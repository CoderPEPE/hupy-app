# Huppy — English conversation practice with voice

A Duolingo-style English learning app where you have realtime voice conversations with an AI tutor.

## Architecture

| Piece | Stack |
|---|---|
| **Backend** | Rust + Axum + PostgreSQL + Diesel ORM |
| **Mobile app** | React Native + TypeScript + Expo (dev builds), React Navigation, Zustand, TanStack Query, react-native-mmkv, Reanimated |
| **Voice layer** | OpenAI Realtime API (`@siteed/audio-studio` for native mic streaming, `react-native-audio-api` for low-latency PCM playback) |

## Backend

```bash
cd backend
cp .env.example .env        # set DATABASE_URL, JWT_SECRET, OPENAI_API_KEY
cargo run                   # applies migrations on boot; serves on http://0.0.0.0:3000
```

### Layout

The server is organized in layers — HTTP stays out of business logic, and
business logic stays out of SQL:

| Path | Responsibility |
|---|---|
| `src/main.rs` | Thin bootstrap: config → pool → migrations → router → serve |
| `src/config.rs` | Typed environment configuration, loaded once at boot |
| `src/api/` | Routers, handlers, request/response DTOs, input validation (axum) |
| `src/services/` | Business rules: mastery math, unlock status, SRS scheduling, gamification, tutor prompt building |
| `src/repositories/` | All Diesel/SQL access, one module per domain |
| `src/models/` | Database entity structs (one module per domain) |
| `src/middleware/` | Cross-cutting HTTP: `AuthUser` extractor, rate limiters |
| `src/errors.rs` / `src/db.rs` / `src/jwt.rs` / `src/password.rs` | Shared plumbing |

`cargo check` / `cargo clippy` / `cargo test` (24 tests) are all clean. The
HTTP contract (routes, JSON shapes, status codes) is stable — the mobile app
is the only consumer and must keep working across refactors.

All endpoints below require `Authorization: Bearer <token>` except `register`, `login`, `refresh`, and `logout`.

### Auth

- `POST /api/auth/register` — `{ email, password }` → `{ token, refresh_token, user }`
- `POST /api/auth/login` — `{ email, password }` → `{ token, refresh_token, user }`
- `POST /api/auth/refresh` — `{ refresh_token }` → `{ token, refresh_token }` — rotates the token pair; presenting an already-rotated token (theft signature) revokes the whole login family
- `POST /api/auth/logout` — `{ refresh_token }` — revokes the login family server-side (idempotent)
- `GET /api/auth/me` → current user

Access JWTs are short-lived (15 min by default); the app transparently
refreshes them via the rotating refresh token, and only its SHA-256 hash is
stored server-side. Tune with `ACCESS_TOKEN_TTL_SECS` / `REFRESH_TOKEN_TTL_SECS`.

### Realtime voice

- `POST /api/realtime/client-secret` — mints a short-lived OpenAI Realtime client secret so the app never sees your API key. The session is configured as a pedagogical English tutor (gpt-realtime-2.1, voice `marin`, semantic VAD, barge-in, transcription).

### Planets & progression

- `GET /api/planets` — all planets with `status` (`active`/`locked`/`completed`), unlock progress, per-metric progress (`sentences`, `pronunciation`, `conversation`, `listening`, `flashcards`, `review`, `mastery`), and sentence counts
- `GET /api/planets/{id}` — planet detail + its sentences with `mastered` flags
- `GET /api/planets/{id}/lesson` — the scripted pedagogical lesson for the planet (teach → repeat → question → correction → review → praise steps, with embedded corrections). Seeded per planet in `lesson_steps`.
- `POST /api/planets/{id}/progress` — `{ metric, delta }` bumps a metric (clamped 0..1); mastery ≥ 0.8 unlocks the next planet
- `POST /api/planets/{id}/sentences/{sentence_id}/master` — `{ mastered }` marks a sentence learned and recomputes the `sentences` metric

### Conversations (live chat history)

- `GET /api/conversations` — list with message counts
- `POST /api/conversations` — `{ title?, planet_id? }` creates one (auto-titled from the planet)
- `GET /api/conversations/{id}` — transcript (messages) + corrections
- `POST /api/conversations/{id}/messages` — `{ role: "user"|"assistant", text, kind? }`
- `POST /api/conversations/{id}/corrections` — `{ said, corrected, explanation, pt?, mistake_part?, subject?, verb?, complement? }`
- `DELETE /api/conversations/{id}`

### Flashcards & spaced repetition

- `GET /api/flashcards?planet_id=&due=true` — list; `due` returns only cards due now
- `POST /api/flashcards` — `{ en, pt, explanation?, subject?, verb?, complement?, planet_id?, source? }`
- `POST /api/flashcards/corrections/{correction_id}/flashcard` — turn a saved correction into a card
- `POST /api/flashcards/{id}/review` — `{ rating: "hard"|"medium"|"easy" }` schedules the next review (SM-2 style: first intervals 1/3/7 days, then ease-scaled growth, capped at 90 days)
- `DELETE /api/flashcards/{id}`

### Text-to-speech

- `POST /api/tts` — `{ text, speed? }` → MP3 audio. Proxies to the OpenAI speech API server-side (no key exposure). Voice/model configurable via `TTS_VOICE` / `TTS_MODEL`. Audio is cached in the `tts_audio` table, so repeat listens are free.

## Production notes

- **Full deployment guide:** [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) covers env vars, Docker, migrations, the reverse proxy, and troubleshooting.
- **CI:** `.github/workflows/ci.yml` runs `cargo fmt --check`, `cargo clippy -D warnings`, and the full backend suite against a Postgres service container, plus the mobile typecheck and jest suite — every push/PR.
- Auth, TTS, and the learning **write** endpoints (conversations, flashcards, planets progress/mastery) are rate-limited **per socket IP** (in-memory sliding window; writes share one budget via `WRITE_RATE_MAX`). Reads are never throttled. Behind a reverse proxy all clients share the proxy's IP and one bucket — see §4 of the deployment guide.
- Set a strong `JWT_SECRET` (`openssl rand -hex 32`); the server logs a warning if it's shorter than 16 chars. Rotating it invalidates every outstanding access token; refresh tokens are re-validated against the DB on each use.
- Set `CORS_ORIGIN` if the backend also serves a web client; unset means allow-all (fine for native apps).
- For production, point the app at an HTTPS backend via `EXPO_PUBLIC_API_URL` (see `mobile/.env.example`); Android enables cleartext for development (`usesCleartextTraffic`) — harmless with an HTTPS URL, but remove it for a release build if you want to forbid cleartext.
- `500` responses are generic (`{"error":"internal server error"}`); the real cause is logged server-side.
- The TTS audio cache self-prunes after `TTS_CACHE_MAX_AGE_DAYS` (default 30) on every cache write.
- `cargo test` covers the rate limiter, the spaced-repetition scheduler, and the gamification rules.

## Docker

```bash
cp backend/.env.example .env   # set JWT_SECRET, OPENAI_API_KEY (optional: POSTGRES_USER/PASSWORD/DB)
docker compose up --build      # Postgres + API; migrations apply on boot
```

The Realtime session is configured as an English tutor (gpt-realtime-2.1, voice `marin`) with semantic VAD, automatic responses, barge-in, and speech transcription.

## Mobile

Requires an **Expo development build** — the native audio modules (microphone streaming + PCM playback) do not run in Expo Go.

```bash
cd mobile
npm install
npx expo run:ios      # or: npx expo run:android
npx expo start --dev-client   # pair the app with Metro (expo-dev-client is installed)
```

The app uses `expo-dev-client`: local launches open the dev launcher on first
run — pick your machine's packager entry (same Wi-Fi) to load the JS bundle.

Notes:

- The API base URL defaults to `http://localhost:3000` (iOS simulator) / `http://10.0.2.2:3000` (Android emulator). For a physical device, set your Mac's LAN IP in `src/config.ts`.
- Cleartext HTTP is enabled for local development via `expo-build-properties`; tighten this before shipping.
- Microphone permission is declared in `app.json` (`NSMicrophoneUsageDescription` / `RECORD_AUDIO`).
### Physical-device builds (EAS)

[`mobile/eas.json`](mobile/eas.json) ships three EAS Build profiles:

- `development` — an `expo-dev-client` build (`ios.simulator: false`, so it
  installs on a physical iPhone), for day-to-day dev work and the
  storage-verification procedure below. Flip `ios.simulator` to `true` for a
  simulator build.
- `preview` — internal distribution (ad-hoc / TestFlight-style) build.
- `production` — auto-incrementing build number, store-ready.

`EXPO_PUBLIC_API_URL` is inlined from your `mobile/.env` (EAS uploads `.env`
files automatically); override per profile with the `env` key if you need
per-environment API URLs.

**Verifying reinstall key-rotation on a real iPhone** (same check as the
simulator run described below):

1. `eas login` and `npx eas init` once, then
   `npx eas build --profile development --platform ios`.
2. Install the build on the device (the EAS link, or `eas build:run
   --platform ios`).
3. Temporarily add the one-line fingerprint log to
   `initSecureStorageInner()` in `src/storage.ts`:
   `console.info('[storage][verify] key fingerprint:', key.slice(0, 12));`
4. `npx expo start --dev-client` (device on the same Wi-Fi), open the app; on
   first launch the dev launcher appears — tap your machine's packager entry,
   then note the fingerprint in the Metro terminal.
5. Delete the app, reinstall the same build, relaunch: a **different**
   fingerprint proves the stale Keychain key was rotated to a fresh one
   (the encrypted store itself is wiped by the uninstall). Remove the
   temporary log afterwards.

- **Auth tokens are encrypted at rest.** The access/refresh tokens and user
  profile live in a dedicated MMKV file encrypted with AES, whose key is
  generated once per install and stored in the iOS Keychain / Android
  Keystore with `WHEN_UNLOCKED_THIS_DEVICE_ONLY` — so it never syncs via
  iCloud or Android backup and is only readable while the device is
  unlocked, binding the session to the device (Android auto-backup is
  disabled via `android.allowBackup`). On iOS the keychain items are pinned
  to an explicit access group (`ios.entitlements` →
  `keychain-access-groups` → `$(AppIdentifierPrefix)com.conjuntos.huppy`),
  which resolves to the same group the app already used by default — the
  entitlement makes the group's location explicit and stable across
  certificate/profile rotation within the same team (dev / ad-hoc /
  TestFlight / App Store) and across future bundle-identifier changes. On
  reinstall, the old key is never reused: the MMKV file dies with the app
  container but the Keychain item can survive uninstall, and init detects
  that stale-key-plus-empty-store signature and rotates to a fresh key,
  re-encrypting the store under it. If a restored backup brings the MMKV
  file without the keychain item, the unreadable file is wiped, re-encrypted
  under a fresh key, and the user simply logs in again (never a plaintext
  downgrade). App boot awaits `initSecureStorage()` before restoring the
  session; if the Keychain is unavailable the app shows a retry screen
  instead of hanging. Support tooling can also force a re-key at any time
  via the exported `rotateSecureStorageKey()` — it re-encrypts the live
  store under a fresh key while preserving the current session.
