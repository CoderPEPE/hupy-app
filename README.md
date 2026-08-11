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

All endpoints below require `Authorization: Bearer <token>` except `register` and `login`.

### Auth

- `POST /api/auth/register` — `{ email, password }` → `{ token, user }`
- `POST /api/auth/login` — `{ email, password }` → `{ token, user }`
- `GET /api/auth/me` → current user

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

- Auth and TTS endpoints are rate-limited **per socket IP** (in-memory sliding window). If you deploy behind a reverse proxy (nginx/Cloudflare), all clients will share the proxy's IP and share one bucket — add `X-Forwarded-For` trust in that case.
- Set a strong `JWT_SECRET` (`openssl rand -hex 32`); the server logs a warning if it's shorter than 16 chars.
- Set `CORS_ORIGIN` if the backend also serves a web client; unset means allow-all (fine for native apps).
- For production, point the app at an HTTPS backend via `EXPO_PUBLIC_API_URL`; the iOS app only permits cleartext to local networking, and Android enables cleartext for development (`usesCleartextTraffic`) — remove that for release builds pointing at HTTPS.
- `cargo test` covers the rate limiter and spaced-repetition scheduler.

The Realtime session is configured as an English tutor (gpt-realtime-2.1, voice `marin`) with semantic VAD, automatic responses, barge-in, and speech transcription.

## Mobile

Requires an **Expo development build** — the native audio modules (microphone streaming + PCM playback) do not run in Expo Go.

```bash
cd mobile
npm install
npx expo run:ios      # or: npx expo run:android
```

Notes:

- The API base URL defaults to `http://localhost:3000` (iOS simulator) / `http://10.0.2.2:3000` (Android emulator). For a physical device, set your Mac's LAN IP in `src/config.ts`.
- Cleartext HTTP is enabled for local development via `expo-build-properties`; tighten this before shipping.
- Microphone permission is declared in `app.json` (`NSMicrophoneUsageDescription` / `RECORD_AUDIO`).
