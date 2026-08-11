# Make Hupy actually work: real AI tutor, real progress, Duolingo-style gamification

## Context

The spec describes a fully-working AI voice tutor: live conversation scoped to
the learner's current planet, an enforced teach→repeat→correct→review cycle,
flashcards that feed back into what the AI reviews, planet unlock driven by
real multi-metric mastery, and a Duolingo-style gamified UI.

The codebase audit found the *scaffolding* for all of this already
exists and is well-built (schema, SRS scheduler, planet unlock math, ephemeral
Realtime auth, transcript UI, correction cards) — but the live AI path is not
actually wired to any of it. Concretely:

- Real voice sessions run on a **static, hardcoded "Planet 1" prompt**
  (`backend/src/realtime.rs:27`) with no tool calling, so the model can never
  record a correction, create a flashcard, or mark a sentence mastered during
  a real conversation. All of that logic only fires from a fake `setTimeout`
  script (`ChatScreen.tsx:295-333`) that replays canned `lesson_steps` rows.
- Planet unlock and every progress bar trace back to that same fake script's
  single `mastery` bump (`ChatScreen.tsx:311-312`) — the other 6 tracked
  metrics are fully modeled server-side but never invoked.
- The mic is fully muted for the tutor's entire turn
  (`useVoiceConversation.ts:147-168`), so voice barge-in (spec: "interrupt the
  AI by talking") doesn't work — only tap-to-interrupt does.
- There is no gamification layer at all (no streaks/XP/badges/mascot), despite
  a mature design system and navigation already in place.

The goal of this plan is to replace the scripted demo with a real,
tool-using AI tutor loop, make progress genuinely earned, close the
flashcard↔chat feedback loop, and add a Duolingo-style gamification layer —
while reusing the substantial existing backend/mobile code rather than
rewriting it.

## Key architecture decisions

**1. Realtime "tools" (function calling) is the mechanism that connects live
conversation to the database.** Today `SessionConfig` has no `tools` field
and the client's `session.update` (`useVoiceConversation.ts:372-393`) sends
none either. We add 5 tools the model can call mid-conversation, each mapped
to REST endpoints that already exist:

| Tool (model-facing args) | Hits existing endpoint |
|---|---|
| `record_correction(said, corrected, explanation_pt, mistake_part?, subject?, verb?, complement?)` | `POST /conversations/{id}/corrections` |
| `create_flashcard(en, pt, explanation_pt, subject?, verb?, complement?)` | `POST /flashcards` |
| `master_sentence(sentence_id)` | `POST /planets/{id}/sentences/{sentence_id}/master` |
| `bump_progress(metric: pronunciation\|conversation\|listening\|review, delta)` | `POST /planets/{id}/progress` |
| `confirm_flashcard_mastery(flashcard_id)` | new: sets `flashcards.verified_live = true` |

`conversation_id`/`planet_id`/`user_id` are **never** tool arguments — the
client already holds `conversationIdRef.current` and the active planet, and
injects them when executing the REST call. This keeps the model's tool
surface small and matches how `ChatScreen.tsx` already persists things.

`sentences` and `flashcards` progress metrics become **server-computed**, not
model-bumped (real counts from `user_sentence_progress` / flashcard interval
stats) — only `pronunciation`/`conversation`/`listening`/`review` stay as AI
judgment calls via `bump_progress`. `mastery` becomes a computed aggregate
(equal-weighted average of the 6 sub-metrics), recalculated server-side after
any of them changes — this is what makes unlock "multiple criteria" instead
of one fabricated number.

**2. The prompt is built dynamically per-session, server-side**, from real
DB state: the active planet's sentences (id + en + pt + subject/verb/complement,
so the model can cite `sentence_id` back), a sample of mastered sentences from
earlier completed planets (cumulative review), and up to 5 flashcards that are
either due or unverified-after-"easy" (surprise-review targets). The active
planet is inferred server-side (first non-`completed` planet by number, reusing
`status_for`) — the client never needs to pass a planet id.

**3. Barge-in is fixed by not muting the mic during playback, but only on iOS.**
`RECORDING_CONFIG` already sets `audioSession.mode: 'VoiceChat'`
(`useVoiceConversation.ts:59-64`), which is Apple's hardware-AEC mode for
exactly this — the current full-mute logic looks like a leftover safety net.
Android has no guaranteed AEC across devices, so Android keeps today's
mute-during-speaking + tap-to-interrupt behavior as a safe fallback. This is a
deliberate platform split, called out explicitly since it's a real product
tradeoff, not an oversight.

**4. Demo mode is retired.** `ChatScreen`'s `mode: 'demo' | 'live'` toggle and
the scripted `setTimeout` replay go away; the screen always runs the real
Realtime session, auto-starting the mic on mount (spec: no buttons). The
existing `CorrectionCard` UI, history views, and `useCorrectionToCard` flow
are reused as-is — they just get fed from real tool-call events instead of
the fake script.

**5. Gamification stays true to Hupy's existing space/planet visual identity**
rather than a literal Duolingo skin (avoids cloning Duolingo's owl/IP; the
existing dark "space path" design in `PlanetsScreen.tsx` is already strong).
What's adopted is Duolingo's *mechanics*: visible streak + XP, celebratory
feedback, an original mascot, path-style progress. No hearts/lives — spec
has no notion of losing progress, so that mechanic isn't invented.

**6. Mobile work reads current Expo v57 docs before touching voice/audio code**,
per `mobile/AGENTS.md`'s explicit instruction that Expo has changed. No new
npm packages are needed anywhere in this plan (reuses `react-native-reanimated`,
`react-native-svg`, `react-native-audio-api`, all already installed) — if that
changes, installs go through `pnpm` per the user's global convention (the repo
currently has a stray `package-lock.json` from npm; leave it alone unless an
install is actually needed, then migrate to `pnpm-lock.yaml`).

---

## Phase 0 — Backend: planet-scoped, tool-using tutor session

Files: `backend/src/realtime.rs`, `backend/src/planets.rs`, `backend/src/flashcards.rs`, new `backend/migrations/2026-08-11-000000_gamification/`

- `planets.rs`: make `status_for` `pub(crate)`; add `pub(crate) async fn active_planet_for(pool, user_id) -> Planet` (first planet whose computed status isn't `"completed"`, falling back to the last planet if all are done).
- Add `pub(crate) fn recompute_mastery(&PlanetProgress) -> f64` (equal-weighted average of the 6 sub-metrics) and a shared `pub(crate) async fn recompute_and_store_mastery(pool, user_id, planet_id)` called from `bump_progress`, `master_sentence`, and the new flashcard-review-driven update in Phase 2. `bump_progress`'s `METRICS` allowlist drops `"mastery"` (no longer directly settable).
- `realtime.rs`: replace the static `TUTOR_INSTRUCTIONS` const with a function that builds instructions from real data: active planet's sentences (with ids), cumulative-review sample from completed planets, due/unverified flashcards, plus the existing well-written pedagogical-cycle prose (teach → explain PT → demonstrate → 3x repeat → correct → related phrases → surprise review → gradual PT→EN shift), now with explicit tool-usage directives ("call `record_correction` whenever you correct him", "call `master_sentence` once he recalls a taught sentence unaided", etc). Define the 5 tool JSON schemas (see table above) and include both in the OpenAI session-creation POST body and in the JSON returned to the client (alongside `instructions`, same pattern as today).
- `flashcards.rs`: migration adds `verified_live BOOLEAN NOT NULL DEFAULT true` to `flashcards` (existing cards default true so nothing is retroactively flagged); `review_flashcard` sets it to `false` when `rating == "easy"`. New handler `POST /flashcards/{id}/confirm-live-mastery` sets it back to `true` (for the `confirm_flashcard_mastery` tool) and recomputes that planet's `flashcards` progress metric (fraction of the user's cards for that planet with `verified_live == true` and `interval_days >= 7`), then calls `recompute_and_store_mastery`.

## Phase 1 — Mobile: real voice pipeline replaces the scripted demo

Files: `mobile/src/voice/useVoiceConversation.ts`, `mobile/src/api/realtime.ts`, `mobile/src/screens/ChatScreen.tsx`

- Before editing: fetch the current Expo v57 docs for audio/permissions APIs touched here (per `mobile/AGENTS.md`).
- `useVoiceConversation`: accept `(onToolCall: (name: string, args: object) => Promise<object>)`. Thread `tools` through from `getRealtimeClientSecret()`'s response into the `session.update` payload. Add handling for the Realtime tool-call event sequence (`response.output_item.added` with `item.type === 'function_call'` → track `call_id → name`; `response.function_call_arguments.done` → parse args, `await onToolCall(name, args)`, send back `conversation.item.create` with `type: 'function_call_output'`, then `response.create` to resume). Auto-invoke `start()` once on mount instead of waiting for a tap.
- Barge-in: on iOS, stop dropping mic frames while `status === 'speaking'` (keep only a short ~150ms grace-mute at the start of a new tutor turn); bump `turn_detection.eagerness` from `'low'` to `'medium'`. Android keeps the existing full-mute behavior — branch on `Platform.OS`.
- `ChatScreen.tsx`: remove the `mode`/`switchMode`/demo `useEffect` scripted-replay block and the mode-switch header UI entirely. `onToolCall` is implemented here using the existing mutation hooks (`useAddCorrection`, `useCreateFlashcard` (new, see Phase 0's plain-create path), `useMasterSentence`, `useBumpProgress`, plus a new `useConfirmFlashcardMastery`), closing over `conversationIdRef.current` and the active planet id. Correction tool-calls feed the existing `CorrectionCard` UI by appending a message with `correction` populated directly from the tool args (no extra round-trip needed to display it). `ensureConversation()` runs on mount instead of lazily.

## Phase 2 — Real progress wiring (already covered by Phase 0's backend work)

Confirm from the mobile side that `useMasterSentence`/`useBumpProgress` are now actually invoked (via `onToolCall`, not the retired demo script) — no separate mobile screen changes needed beyond Phase 1, since `PlanetsScreen.tsx` already renders whatever `usePlanet`/`usePlanets` return.

## Phase 3 — Flashcards: S/V/C on both faces + easy-card re-verification surfaced

Files: `mobile/src/screens/FlashcardsScreen.tsx`, `mobile/src/api/flashcards.ts`, `mobile/src/api/hooks.ts`

- Add subject/verb/complement chips to the back face (front already has them per the audit).
- Add `confirmFlashcardMastery` to `api/flashcards.ts` and `useConfirmFlashcardMastery` to `hooks.ts` (used by Phase 1's `onToolCall`).
- Small `verified_live === false` badge on cards rated "easy" but not yet re-confirmed ("AI will double-check this one"), sourced from the `verified_live` field already returned in `CardJson` once Phase 0 adds it.

## Phase 4 — Fix the "English with pause for repeat" audio mode

File: `mobile/src/screens/PlanetsScreen.tsx` (`AudioPanel`)

Mode 1 currently produces the identical script to English-only
(`PlanetsScreen.tsx:463-464`). Replace the single-big-`speak()`-call approach
for this mode only with a per-sentence stepper: for each sentence, `await
speechPlayer.speak(s.en)` → wait ~2.5s of silence (the repeat window) →
`await speechPlayer.speak(s.en)` again → move to next sentence. Needs a
cancellation flag so `togglePlay`'s stop path can break the loop mid-sequence;
`progress`/`nowText` update per-sentence instead of via the current
single-duration timer. Other modes (0, 2, 3, 4) are untouched.

## Phase 5 — Gamification + Duolingo-style polish

Files: new `backend/src/gamification.rs` + migration (same file as Phase 0's), new `backend/src/main.rs` route, new `mobile/src/api/gamification.ts`, new `mobile/src/components/{StreakXpBar,Confetti,Mascot}.tsx`, edits to `ChatScreen.tsx`/`PlanetsScreen.tsx`/`FlashcardsScreen.tsx` headers.

- **Schema**: `user_stats(user_id PK, xp INT DEFAULT 0, streak_days INT DEFAULT 0, longest_streak INT DEFAULT 0, last_active_date DATE)`; `badges(id, code UNIQUE, title, description, icon)` seeded with ~7 achievable badges (first correction, first flashcard, 3-day streak, 7-day streak, first planet completed, 50 cards reviewed, first live conversation); `user_badges(user_id, badge_id, earned_at, UNIQUE(user_id, badge_id))`.
- **Backend**: no client-triggered "add XP" endpoint (avoids gaming it) — award XP and touch streak/`last_active_date` server-side inside the handlers that already represent real learning events (`add_correction`, `master_sentence`, `review_flashcard`, `bump_progress`), via a shared `touch_activity_and_award_xp(conn, user_id, xp_delta)` helper that also runs `check_and_award_badges`. New `GET /api/gamification/stats` returns `{xp, streak_days, longest_streak, badges: [...]}`.
- **Mobile**: `useGamification()` query, invalidated by the same mutation hooks that call the XP-awarding endpoints (`useAddCorrection`, `useMasterSentence`, `useReviewFlashcard`, `useBumpProgress`). `StreakXpBar` (flame + streak count, compact XP bar) slots into the existing header row of all three screens — `dark` variant for `PlanetsScreen`'s space theme, light for Chat/Flashcards, matching the existing `AppTabBar`/`LanguageSwitch` `dark`-prop convention. `Confetti` (Reanimated-driven burst, no new deps) fires on planet unlock (already has an `unlockNotice` trigger point in `ChatScreen.tsx`), new badge earned, and streak milestones. `Mascot` is an original SVG character (not Duolingo's owl) in Hupy's brand purple with a simple idle bob (reusing the existing `floatAnim` pattern from `PlanetsScreen.tsx`), placed on `ChatScreen`'s empty/idle state and celebration moments.

---

## Progress

- [x] **Phase 0 — Backend** (done): `backend/migrations/2026-08-11-000000_gamification/` (verified_live column + user_stats/badges/user_badges tables + seeded badges, applied, `schema.rs` regenerated). `planets.rs`: `status_for` now `pub(crate)`, added `compute_mastery`/`with_metric`/`set_metric_absolute`/`bump_metric_delta` (mastery is always the computed average of the 6 sub-metrics, never set directly — `BUMPABLE_METRICS` restricts `bump_progress` to pronunciation/conversation/listening/review), `active_planet_for`, `tutor_sentences_for`, `cumulative_review_sample`; `bump_progress`/`master_sentence` handlers refactored onto the shared helpers. `flashcards.rs`: `verified_live` flag (cleared on "easy" rating, restored via new `POST /flashcards/{id}/confirm-live-mastery`), `recompute_flashcards_metric`, `review_targets_for`. `realtime.rs`: fully rewritten — `build_instructions()` pulls active planet + sentences + cumulative review sample + pending-recheck flashcards from the DB per request, `tool_schemas()` defines the 5 Realtime tools (record_correction, create_flashcard, master_sentence, bump_progress, confirm_flashcard_mastery), both returned to the client alongside the ephemeral secret. `cargo build` clean, `cargo test` 16/16 passing (added 3 new mastery-aggregation tests in `planets.rs`).
- [x] **Phase 1 — Mobile voice pipeline** (done): `useVoiceConversation.ts` now takes an `onToolCall` handler and speaks the Realtime function-calling wire protocol (`response.output_item.added` → track call_id/name, `response.function_call_arguments.done` → execute, reply with `function_call_output` + `response.create`); iOS keeps the mic live during tutor playback (relies on the existing `VoiceChat` audio-session AEC) for real voice barge-in, with only a 150ms grace window at turn-start, while Android keeps the old full-mute+tap-to-interrupt fallback (no reliable AEC there). `api/realtime.ts` threads `tools` through. `ChatScreen.tsx`: removed the demo/live mode toggle and the fake `setTimeout` script entirely; mic auto-starts once the active planet is known; `onToolCall` implements all 5 tools via existing mutation hooks (plus new `useConfirmFlashcardMastery`), feeding real corrections into the existing `CorrectionCard` UI. Also fixed a pre-existing, unrelated bug found along the way: `mobile/jest.config.js`'s `transformIgnorePatterns` wasn't pnpm-aware (didn't whitelist `.pnpm/` the way `jest-expo`'s own preset does), so all 3 Jest suites failed to even run before this session — confirmed via `git stash` that it broke identically on `main`. Fixed by aligning with the preset's actual pattern. `pnpm typecheck` clean, `pnpm test` 20/20 passing.
- [x] **Phase 3 — Flashcard S/V/C back face + verified_live UI** (done): back face now shows subject/verb/complement chips (dark-on-primary variant of the existing structure box). Cards rated "easy" but not yet `verified_live` show a "Marked easy — Huppy will double-check this live" badge. Added `confirmFlashcardMastery`/`useConfirmFlashcardMastery`, `Flashcard.verified_live` in types, new i18n keys in both `en.ts`/`pt-BR.ts`. `pnpm typecheck` clean.
- [x] **Phase 4 — Fix audio pause-for-repeat mode** (done): `PlanetsScreen.tsx`'s `AudioPanel` mode 1 is now a real per-sentence sequencer (`playPauseForRepeat`) — hear it, 2.5s real silence to repeat, hear it again, next sentence — with a `cancelRef` so stopping mid-sequence actually breaks the loop. Modes 0/2/3/4 untouched. New i18n key `planets.yourTurn`. `pnpm typecheck`/`pnpm test` clean.
- [x] **Phase 5 — Gamification + Duolingo-style polish** (done): new `backend/src/gamification.rs` — `touch_activity_and_award_xp` (streak/XP/badge bookkeeping, never client-triggered, called from `add_correction`/`master_sentence`(on mastery)/`review_flashcard`/`bump_progress`(positive deltas), failures logged not propagated so gamification never breaks the primary action) + `GET /api/gamification/stats`, registered in `main.rs`. Mobile: `api/gamification.ts` + `useGamificationStats`, gamification query invalidated by the 4 XP-awarding mutation hooks. New components — `StreakXpBar` (flame+streak, star+level with mini XP bar; wired into Chat/Planets(dark)/Flashcards headers), `Confetti` (one-shot burst on planet unlock + new badge, deliberately built on core `Animated` rather than `react-native-reanimated` worklets — confirmed there's no babel config wiring the reanimated plugin in this project, so worklet hooks weren't safe to introduce untested), `Mascot` (original SVG space-companion character, not a Duolingo lookalike, idle-bobs via core `Animated`). `cargo test` 19/19, `pnpm typecheck`/`pnpm test` 20/20.
- [x] **Verification** (done, with one item needing your action):
  - `cargo build` / `cargo test` (19/19) clean on the final tree.
  - `pnpm typecheck` / `pnpm test` (20/20) clean on the final tree.
  - Actually launched the app: backend restarted on the new build, Metro rebundled clean (3559 modules), app relaunched on an iOS 17 Pro simulator via `cua-driver` pixel-driven interaction (its AX tree only exposes Simulator's own menu bar, not the iOS app content, so this was screenshot-driven).
  - **Found and fixed a real, pre-existing, unrelated crash**: `RegisterScreen.tsx`'s `passwordStrength()` computed `map[Math.min(score, map.length) - 1]`, which is `map[-1]` (`undefined`) whenever `score === 0` — true for virtually the first keystroke of any password (e.g. a single lowercase letter satisfies none of the 5 strength criteria). This crashed account creation for basically every real user, unconditionally. Confirmed the crash, applied a one-line clamp fix, confirmed it's gone (password field now shows the "Weak" strength meter correctly instead of crashing).
  - Also fixed two pre-existing, unrelated tooling regressions from the npm→pnpm switch along the way (see Phase 1 note): Jest's `transformIgnorePatterns` and a stale Metro cache after pnpm relocated `node_modules`.
  - **Not verified — needs you**: while registering a throwaway test account to check the screens, the freshly-restarted backend triggered a real macOS prompt: *"'huppy-backend' wants to connect to Postgres.app without using a password"*. Nothing in this session can click that dialog (no accessibility automation permission is granted to this shell, and I won't grant that myself). **You need to click "OK" on it** — until then, every DB-touching backend request will hang for ~30s and fail. It's still open on your screen.
  - Also unverified for the same reason: the specific visual concern I flagged after building `PlanetsScreen`'s header (back button + mastery pill + new `StreakXpBar` + language switch all in one row) — whether it crowds on-screen. Worth a 10-second look once you're logged in.
  - True voice barge-in and mic-echo behavior (the iOS full-duplex fix in Phase 1) needs your own on-device check — a physical mic/speaker loop can't be verified headlessly, as flagged in the original plan.

## Verification

- `cd backend && cargo test` — existing `schedule()`/`status_for()` tests plus new tests for `recompute_mastery()` and badge-threshold logic.
- `cd backend && cargo build` — confirms the realtime.rs/planets.rs/flashcards.rs refactor compiles.
- `cd mobile && pnpm typecheck && pnpm test` — existing Jest specs (`client.test.ts`, `validation.test.ts`, `audioCodec.test.ts`) plus the codebase's typecheck script.
- Launch via the `run` skill (backend + Expo dev build) and manually walk: enter Chat → mic auto-starts with no tap → speak → tutor responds and a correction/flashcard appears in real time → check Planets tab shows moved progress bars → check Flashcards tab shows the new card with S/V/C on both faces → rate a card "easy" and confirm the `verified_live` badge appears → play the planet's "pause for repeat" audio mode and confirm actual pauses. Voice barge-in and mic-echo behavior need the user's own on-device check (a physical mic/speaker loop can't be verified headlessly) — this will be called out explicitly rather than claimed as tested.
