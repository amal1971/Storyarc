# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install
npm run dev       # vite dev server on :5173, with dev API bridge (see below)
npm run build     # vite build -> dist/
npm run preview   # preview the production build
```

No test suite, no lint config exists in this repo. There is no `.git` here — this directory is not (yet) a git repository, so don't assume git commands work.

To go from mock/offline to live LLM + STT calls locally: `cp .env.example .env.local`, paste `GEMINI_API_KEY=...`, restart `npm run dev`. The start screen's demo-mode chip (🧪 vs ⚡) reflects `/api/health` and tells you which mode is active.

## Architecture

**Two independent loops driven by one `screen` state machine in `src/App.jsx`** — there's no router:
- Lab loop: `start → lab-pick → record1 → processing → feedback → record2 → processing → delta`
- Gym loop: `start → gym-pick → gym-record → processing → gym-feedback → gym-record2 → processing → gym-delta`

`mode` (`'lab' | 'gym'`) is derived from `screen`, not stored separately. `analyze()` is the single entry point for both loops's "recording finished" transition; it dispatches to `runLabAnalysis` or `runGymAnalysis` based on the mode passed in at call time (captured in `lastBlobRef` for retry-after-error). Both loops now end their second attempt with a call to `compareAttempts()` (see below) before flipping to the delta screen — `delta`/`gym-delta` never render until that call resolves, so `comparison`/`gymComparison` state is guaranteed non-null by the time those screens mount.

**`api/compare-attempts.js` is the only call that reads both attempts together**, and it's what makes the retry loop mean something rather than just producing two independent report cards. Every other `api/analyze-*.js` endpoint analyzes a single transcript in isolation. This one takes `transcript1` + `transcript2` (+ `suggestedFix` for lab mode, or `frameworkId`/`steps1` for gym mode) and judges whether the advice from attempt 1 actually landed (`fix_addressed: yes|partly|no`), what concretely changed, and one thing to keep/carry forward. It runs at `temperature: 0.5` — this is a judgment-with-prose call, not pure classification, so it needs the same non-zero temperature treatment as the retelling (see Gemini section below). `compareAttempts()` in `src/lib/analyze.js` wraps it with the same mock-on-failure pattern as every other analyzer, except the mock is deliberately honest that it's a mock (`provider: 'mock'`) rather than fabricating a plausible-sounding comparison — a fake "here's what changed" would be actively worse than no comparison, since the whole point of this call is telling the speaker the truth about their own two tellings.

**Client/server split exists purely to hide API keys, not for architecture cleanliness.** Every `src/lib/*` client function that calls out to an LLM (`analyzeFillers`, `analyzeStructure`, `analyzeFramework`) POSTs to a matching `api/*.js` serverless function, and **on any failure (network, non-2xx, malformed payload) falls back to a deterministic mock implemented in the same client file**. This mock fallback is not a dev convenience to be deleted — it's the app's designed degrade path (Milestone Zero: the app is built against `MockProvider` and mock analyzers first, real providers second) and is what makes `npm install && npm run dev` work with zero keys. When changing an `api/*.js` endpoint's response shape, update the matching mock in `src/lib/analyze.js` / `src/lib/stt.js` or the fallback silently produces a different shape than the live path.

**`vite.config.js`'s `devApiPlugin` is the reason `api/*.js` files work under `npm run dev`** — it's a middleware that loads `.env.local`, dynamically imports `api/<name>.js` via `server.ssrLoadModule`, and shims a minimal `res.status().json()` so the exact same handler files run standalone in dev and as Vercel/Netlify functions in production. There's no separate dev-mode API implementation to keep in sync.

**Filler detection is two-tier, and only Tier A is deterministic:**
- Tier A (`src/lib/fillers.js`): fixed regex list (`um`, `uh`, `kind of`, etc.), 100% client-side, no LLM, no network.
- Tier B: Gemini-adjudicated contextual fillers (e.g. discourse "like", hedging), proxied through `api/analyze-fillers.js`, mocked by `mockTierB` in `src/lib/analyze.js` when unreachable.
- `mergeEvents()` in `fillers.js` combines both, dropping any Tier B span that overlaps a Tier A span — Tier A always wins on overlap.

**Anti-fabrication guardrail (`evidenceIsValid` in `src/lib/analyze.js`)**: any LLM-produced "evidence" quote must be a verbatim substring (≤12 words) of the transcript. `analyzeStructure` enforces this in code after the API call — a failed check doesn't throw, it silently drops the quote (`evidence: null, evidence_rejected: true`) rather than failing the whole analysis. Apply the same pattern to any new LLM output field that quotes the transcript.

**The framework registry (`src/lib/frameworks.js`) is the single source of truth for the Gym.** `FRAMEWORKS` entries (id, name, steps, `analysisGuidance`, `retellGuidance`) drive the picker UI, `mockFramework`'s heuristic analyzer, and the Gemini prompt built in `api/analyze-framework.js`. Adding a new framework (e.g. a third beyond ABT/SCR) means adding one entry here — no other file needs to change unless the mock heuristics (`BEAT_CHECKS`/`BEAT_KIND` in `analyze.js`) need new regex for the new beat kinds. The same file also exports `GYM_SAMPLE` — a canned, pre-analyzed Gym result (steps + retelling) consumed only by `StartScreen.jsx`'s sample-peek modal, not by the live analysis path. Keep it in sync with `SAMPLE` in `src/lib/prompts.js` (the Lab equivalent) if you change what the sample modal shows.

**Session data (`src/lib/session.js`) is local-first with no backend persistence**: every attempt is appended to `localStorage` under `storyarc_session_v1` via `buildAttemptRecord`/`saveRecord`, and `exportSession` dumps it as a downloadable JSON file. There are no user accounts and no server-side storage — this is intentional per the product's scope (see README's "Deliberate scope notes"), not a missing feature.

**Gemini calls are centralized in `api/_gemini.js`** (`geminiJSON(prompt, { temperature = 0 })`): defaults to temperature 0, which is correct for pure-judgment calls, but every call that also generates prose passes a higher value explicitly — `analyze-framework.js` (retelling) at 0.6, `analyze-structure.js` at 0.4, `compare-attempts.js` at 0.5. **This matters more than it looks**: temperature 0 always picks the most probable next token, which for generative prose means the most generic possible phrasing — it was the root cause of "the AI output sounds bland/generic" complaints before this was fixed. Don't reflexively pin new prose-generating calls back to 0; the anti-fabrication guardrails (verbatim substring checks) are what keep output honest, not low temperature. The model name is env-overridable (`GEMINI_MODEL`) because Gemini models get retired on a schedule — don't hardcode a model string elsewhere (current default: `gemini-3.6-flash`, since `gemini-2.0-flash` was retired mid-2026).

**STT provider selection is server-side and swappable** (`STT_PROVIDER=mock|deepgram|assemblyai|gemini` in `api/transcribe.js`), but everything downstream of `transcribe()` in `src/lib/stt.js` only ever consumes `Transcript.text` — don't add code elsewhere that depends on a specific provider's response shape (word timestamps, confidence scores, etc.) since most providers don't return them uniformly.

Per the README, the LLM prompts currently in `api/analyze-*.js` are working stand-ins, expected to be replaced with paste-ready prompts from the companion rubric files (`StoryArc_Task1_Rubrics_Prompts_EvalSet.md`, `StoryArc_Filler_Prompt_v2_Generalized.md`) before Milestone 2 sign-off — check those files exist alongside this repo before assuming a prompt rewrite is unguided.

**`src/styles.css` deliberately has two different oranges/corals** (`--coral`/`--orange` vs. `--coral-btn`/`--orange-btn`). The bright pair is decorative-only (hero gradient text, dashed borders) and was never contrast-checked against anything. The `-btn` pair is darker and exists solely because `.btn-primary` and `.record-btn` put solid white text on top of the fill — the bright originals fail WCAG there (as low as 2.35:1 at the orange end). Don't collapse these back into one variable; that's reintroducing a real accessibility failure, not cleanup. Same reasoning applies to `--violet`, which was nudged 3% darker (`#7c5cff` → `#7859f7`) specifically to clear 4.5:1 everywhere it's used as text-on-white or white-on-violet-background — if you need a brighter violet for a new decorative (non-text) use, add a separate token rather than changing this one.
