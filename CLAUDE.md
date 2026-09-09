# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install
npm run dev       # vite dev server on :5173, with dev API bridge (see below)
npm run build     # vite build -> dist/
npm run preview   # preview the production build
npm run eval      # score the deterministic filler detector against eval/fixtures
```

There is no test runner and no lint config. `npm run eval` is the only automated check — **run it after touching `src/lib/fillers.js`**; it exits non-zero if F1 falls below `EVAL_MIN_F1` (default 0.85, currently ~0.97) and prints every false positive and miss by fixture. Two fixtures are deliberate known limitations (a context-blind "you know", an emphatic "no, no, no") kept in so the number stays honest — don't "fix" them by loosening the expectations.

This IS a git repository (`origin` = github.com/amal1971/Storyarc, branch `main`). No credential helper is configured, so pushes need an explicit token.

To go from mock/offline to live LLM + STT calls locally: `cp .env.example .env.local`, paste `GEMINI_API_KEY=...` (add `STT_PROVIDER=deepgram` + `DEEPGRAM_API_KEY=...` for real transcription), restart `npm run dev`. The start screen's demo-mode chip (🧪 vs ⚡) reflects `/api/health` and tells you which mode is active. `GEMINI_MODEL` is also read but is not in `.env.example`.

## Architecture

**Two loops plus two side screens, driven by one `screen` state machine in `src/App.jsx`** — there's no router:
- Lab loop: `start → lab-pick → record1 → processing → feedback → record2 → processing → delta`
- Gym loop: `start → gym-pick → gym-record → processing → gym-feedback → gym-record2 → processing → gym-delta`
- Side screens: `history`, `about` — reachable from the footer on any screen. `sideScreen` suppresses the progress crumbs on those.

`mode` (`'lab' | 'gym'`) is derived from `screen`, not stored separately. Both loops end their second attempt with a `compareAttempts()` call before flipping to the delta screen, so `comparison`/`gymComparison` are guaranteed non-null by the time `delta`/`gym-delta` mount.

**There are three ways into the pipeline, and they converge immediately.** `RecordScreen` is shared by all four recording screens and emits one shape:

```js
onSubmit({ blob, seconds, inputMode: 'mic' })
onSubmit({ blob, seconds, inputMode: 'sample', sampleId })   // bundled clip from public/samples/
onSubmit({ text,          inputMode: 'text'  })              // typed — skips STT entirely
```

`analyze(input, attemptNumber, analysisMode)` takes that object (**not a blob** — `lastInputRef`, not `lastBlobRef`), and `getTranscript()` is the fork: a `text` input short-circuits to `{ text, provider: 'typed' }` and never calls `transcribe()`. This is only cheap because everything downstream of `transcribe()` consumes nothing but `Transcript.text` — preserve that invariant or the typed and sample paths break. `inputMode` is threaded into the analysis object, the session record (`input_mode`), and the UI (`SignalRow` badges typed/sample runs) so exports and screens stay honest about provenance.

**`api/compare-attempts.js` is the only call that reads both attempts together**, and it's what makes the retry loop mean something rather than producing two independent report cards. Every other `api/analyze-*.js` endpoint analyzes a single transcript in isolation. This one takes `transcript1` + `transcript2` (+ `suggestedFix` for lab mode, or `frameworkId`/`steps1` for gym mode) and judges whether the advice from attempt 1 actually landed (`fix_addressed: yes|partly|no`), what concretely changed, and one thing to keep/carry forward. It runs at `temperature: 0.5`.

**Mock fallback happens ONLY when no key is configured — never when a configured model merely fails.** This distinction was added after a live incident: Gemini 3.6-flash started intermittently returning 503 ("high demand"), and the old code treated every failure identically, silently serving the offline mock — whose gym output is the speaker's own transcript sliced into N chunks with keyword-regex verdicts, which reads as a broken product, not a degraded one. The fix, and the pattern to preserve for any new endpoint:
- `api/_gemini.js`'s `geminiJSON()` retries up to 3× with exponential backoff (honoring `Retry-After`) on `429/500/502/503/504` and network faults only — never on 400/401, which will fail identically forever. Exhausting retries throws `GeminiUnavailableError` (`.retryable = true`); anything else throws a plain `Error`.
- Every `api/analyze-*.js` handler calls `geminiConfigured()` first and returns `503 { error: 'not_configured', configured: false }` if no key exists — this is the signal that zero-key demo mode should render its mock, and it's the ONLY legitimate reason to mock.
- On a thrown error, handlers return `503 { error: 'model_unavailable', configured: true, retryable: true }` for `GeminiUnavailableError`, else `502 { error: 'analysis_failed', configured: true }`.
- Client-side, `postJSON()` in `src/lib/analyze.js` reads `configured`/`retryable` off a non-2xx body onto the thrown `Error`. `degradeOrThrow(err, tag, mockValue)` is the single chokepoint every analyzer's catch block routes through: `err.configured === true` → rethrow (caller must show a retry, never invent output); otherwise → return `mockValue`. **Any new analyzer must route its failure through `degradeOrThrow`, not a bare try/catch that mocks unconditionally** — that's the exact regression this fixed.
- `App.jsx`'s `analyze()` catches a rethrown configured-failure and sets `procError.kind = 'busy'` when `err.retryable`, which `ProcessingScreen` renders as its own state ("The model is busy right now" + retry) — distinct from the generic `'llm'` failure and from `'gibberish'` (near-empty transcript).

**Client/server split exists purely to hide API keys, not for architecture cleanliness.** Every `src/lib/*` client function that calls out to an LLM (`analyzeFillers`, `analyzeStructure`, `analyzeFramework`, `compareAttempts`) POSTs to a matching `api/*.js` serverless function. When changing an `api/*.js` endpoint's response shape, update the matching mock in `src/lib/analyze.js` / `src/lib/stt.js` or the fallback silently produces a different shape than the live path. Every result carries a `provider` field, and `provider: 'mock'` is badged in the UI — degradation is never silent, and (per the point above) it should also never be silently *wrong*.

**Every generated result carries provenance** (`prompt_version`, a per-endpoint constant bumped when the prompt changes materially; `model`, from `GEMINI_MODEL`), and `buildAttemptRecord()` now persists it under `provenance`, plus the full `retelling` array, `framework_feedback_line`, and the complete `comparison` object (via `annotatePair`) — all four were previously computed, shown once, and discarded on unmount. This is what makes an exported session usable as a review corpus for improving the prompts, not just a transcript+metrics dump.

**`vite.config.js`'s `devApiPlugin` is the reason `api/*.js` files work under `npm run dev`** — middleware that loads `.env.local`, dynamically imports `api/<name>.js` via `server.ssrLoadModule`, and shims a minimal `res.status().json()` so the exact same handler files run standalone in dev and as Vercel functions in production. There's no separate dev-mode API implementation to keep in sync. Note that Vite's dev server does **not** reliably pick up newly *created* component files — if an import fails to resolve after adding a file, restart the dev server before debugging further.

**Filler detection is three passes, and only the model-backed one is non-deterministic:**
- Tier A (`detectTierA`): fixed regex list (`um`, `uh`, `kind of`, …), longest-match-first, client-side, no network.
- Tier A′ (`detectRepetitions`): back-to-back repetition loops — the same 1–4 word run repeated (`"day and out, day and out, day and out"`, `"we, we"`). One event spans the whole loop, `category: 'repetition'`, and it gets its own highlight colour in `TranscriptView`.
- Tier B: Gemini-adjudicated contextual fillers (discourse "like", hedges, near-repetitions, empty connectives), via `api/analyze-fillers.js`, mocked by `mockTierB`.

`detectDeterministic()` runs A′ then A and drops any listed filler falling inside a repetition span — **call this, not `detectTierA`, from app code**. `mergeEvents()` then folds in Tier B, dropping any Tier B span overlapping a deterministic one. Deterministic always wins on overlap.

**Anti-fabrication guardrail (`evidenceIsValid` in `src/lib/analyze.js`)**: any LLM-produced "evidence" quote must be a verbatim substring (≤12 words) of the transcript. `analyzeStructure` enforces this in code after the API call — a failed check doesn't throw, it retries once at temperature 0 and then degrades by dropping the quote (`evidence: null, evidence_rejected: true`) rather than failing the whole analysis. Apply the same pattern to any new LLM output field that quotes the transcript.

**Derived signals are computed in code, never asked of the model** — they're free, exact, and can't hallucinate. `wordsPerMinute()` (from `duration_s`, which is `null` for typed input), `topFiller()` (the "your tell" line — deliberately returns `null` unless one token has ≥3 uses *and* ≥30% share, so the app never invents a pattern from a spread of one-offs), and the gym's beat-verdict movement in `GymDeltaScreen` (an ordinal `missed < partial < hit` comparison). `src/components/Signals.jsx` holds the shared `SignalRow` / `TellLine` / `ConnectedNote` pieces used by all four feedback screens.

**`GymPickScreen` is deliberately three visual tiers, not one repeated card style.** It was rebuilt after user feedback that "everything looks like a CTA" — the prompt (`.situation-panel`, tinted, no hard shadow), the framework choice (`.fw-card`, hard shadow + an explicit `✓` on the selected one), and the beat reference (`.fw-detail--quiet`, flat, no border) now read as three different kinds of thing: read this, pick one of these, glance at this. Only `.btn-primary` keeps the full shadow. If you touch this screen, preserve that only one element type per screen should carry `--shadow` — that's the actual fix, not the specific colors. Also: the screen title now says "Story Gym" everywhere (it said "Framework Gym" on this screen and "Story Gym" on the start-screen card — pick one name and keep it consistent across every surface that names a mode).

**The framework registry (`src/lib/frameworks.js`) is the single source of truth for the Gym.** `FRAMEWORKS` entries (id, name, steps, `analysisGuidance`, `retellGuidance`) drive the picker UI, `mockFramework`'s heuristic analyzer, and the Gemini prompt in `api/analyze-framework.js`. Adding a framework is one entry here — but STAR (the 4-beat case) showed two things that also need touching for a genuinely new shape: `BEAT_KIND` in `analyze.js` must map each new beat key onto `setup|turn|landing` for the offline mock, and `CANNED_RETELLING` only fits 3-beat frameworks (`isMockStory` is gated on `steps.length === 3`; anything else falls through to `splitIntoBeats`). The same file exports `GYM_SAMPLE`, a canned pre-analyzed result consumed only by `StartScreen`'s sample-peek modal — keep it in sync with `SAMPLE` in `src/lib/prompts.js` (the Lab equivalent). `randomSituation()` accepts a single id or a Set of everything seen this session.

**Session data (`src/lib/session.js`) is local-first with no backend persistence**: every attempt is appended to `localStorage` under `storyarc_session_v1` via `buildAttemptRecord`/`saveRecord`. There are no accounts and no server-side storage — intentional per the product's scope, not a missing feature. Beyond the basics: `annotatePair(pairId, patch)` merges fields into the *most recent* record for a pair (used to attach the comparison verdict to attempt 2 after it resolves — the comparison isn't known when the record is first written); `loadPairs()` groups records into rounds by `pair_id` for the History screen; `clearSession()` backs the "Clear my data" control. Records carry `input_mode`, `duration_s`, and `wpm` alongside the transcript and filler events.

**Gemini calls are centralized in `api/_gemini.js`** (`geminiJSON(prompt, { temperature = 0 })`): defaults to 0, which is correct for pure-judgment calls, but every call that also generates prose passes a higher value explicitly — `analyze-framework.js` (retelling) 0.6, `analyze-structure.js` 0.4, `compare-attempts.js` 0.5. **This matters more than it looks**: temperature 0 always picks the most probable next token, which for generative prose means the most generic possible phrasing — it was the root cause of "the AI output sounds bland/generic" before it was fixed. Don't reflexively pin new prose-generating calls back to 0; the verbatim substring checks are what keep output honest, not low temperature. The model name is env-overridable (`GEMINI_MODEL`) because Gemini models get retired on a schedule — don't hardcode a model string elsewhere (current default `gemini-3.6-flash`, since `gemini-2.0-flash` was retired mid-2026).

**STT provider selection is server-side and swappable** (`STT_PROVIDER=mock|deepgram|assemblyai|gemini` in `api/transcribe.js`), but everything downstream of `transcribe()` in `src/lib/stt.js` only ever consumes `Transcript.text` — don't add code depending on a specific provider's response shape (word timestamps, confidence scores), since providers don't return them uniformly. Deepgram runs with `filler_words=true`; without it the provider strips exactly the disfluencies this app exists to detect.

**`src/styles.css` deliberately has two different oranges/corals** (`--coral`/`--orange` vs. `--coral-btn`/`--orange-btn`). The bright pair is decorative-only (hero gradient text, dashed borders) and was never contrast-checked. The `-btn` pair is darker and exists solely because `.btn-primary` and `.record-btn` put solid white text on the fill — the bright originals fail WCAG there (as low as 2.35:1 at the orange end). Don't collapse these into one variable; that reintroduces a real accessibility failure. Same reasoning for `--violet`, nudged 3% darker (`#7c5cff` → `#7859f7`) to clear 4.5:1 everywhere it's text-on-white or white-on-violet — if you need a brighter violet for a decorative (non-text) use, add a separate token.

Per the README, the LLM prompts in `api/analyze-*.js` are working versions with worked examples, expected to be revised against the companion rubric files (`StoryArc_Task1_Rubrics_Prompts_EvalSet.md`, `StoryArc_Filler_Prompt_v2_Generalized.md`) that live *outside* this repo — check they exist alongside it before assuming a prompt rewrite is unguided.

## Product decisions that look like gaps but aren't

Reversing any of these is a product decision, not a cleanup: **no accounts/database** (local-first, with export and clear); **two separate metrics, never a composite score**; **attempt 1 shows no numeric grades** — they surface only on the delta screen; **the lab retry screen is deliberately bare** (no transcript, no fix reminder — that's what makes the comparison meaningful), while the gym keeps its beat scaffold visible because the gym is scaffolded practice and the lab tests internalization.
