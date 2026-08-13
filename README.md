# StoryArc 🎙️

Speak a short personal story → get transcript-based feedback on **filler words** and **story structure** → immediately retell it → see exactly what improved. Plus a **Framework Gym**: answer a given situation using a storytelling framework (ABT, SCR, …) and hear your own story retold through it.

Portfolio proof-of-concept (MVP v1). No accounts, no database — sessions are browser-local with JSON export.

## Run it (zero keys needed)

```bash
npm install
npm run dev
```

Runs fully offline out of the box: STT and all LLM calls degrade to deterministic **mocks** (per Milestone Zero, the app is built against `MockProvider` until an STT provider passes the planted-filler gate). The start screen shows a **🧪 Demo mode** chip so you always know which mode you're in.

## Plug in your API keys (2 minutes)

**Local dev** — the dev server runs the same `api/` functions via a built-in bridge:

```bash
cp .env.example .env.local
# paste GEMINI_API_KEY=... into .env.local
npm run dev
```

That's it. The chip on the start screen flips to **⚡ Live analysis**. Add `STT_PROVIDER=deepgram` (or `assemblyai` / `gemini`) plus that provider's key when Milestone Zero picks a winner — until then transcription stays on the built-in sample and everything else runs live.

**Production** — push to GitHub, import the repo in Vercel (it auto-detects Vite + the `api/` functions), and set the same env vars in *Project Settings → Environment Variables*. No code changes; keys never touch the browser.

| Env var | What it unlocks |
|---|---|
| `GEMINI_API_KEY` | Filler adjudication, structure analysis, framework gym analysis + retelling |
| `STT_PROVIDER` | `mock` (default) / `deepgram` / `assemblyai` / `gemini` |
| `DEEPGRAM_API_KEY` / `ASSEMBLYAI_API_KEY` | Real speech-to-text for the matching provider |

## Adding a framework to the Gym

Add one entry to `FRAMEWORKS` in [src/lib/frameworks.js](src/lib/frameworks.js) — id, name, emoji, beats (`steps`), and two prompt-guidance strings. The picker UI, the beat-verdict screen, the retelling renderer, the mock analyzer, and the Gemini prompt all generate themselves from that entry. Nothing else to touch.

## Architecture map

- `src/lib/fillers.js` — Tier-A deterministic filler detection, event merging, rate math (client-side, no LLM)
- `src/lib/stt.js` — STT adapter; everything downstream consumes only `Transcript.text`
- `src/lib/analyze.js` — analysis calls + the verbatim-evidence guardrail (checked in code)
- `src/lib/frameworks.js` — the framework registry (ABT, SCR) + gym situations; single source of truth
- `src/lib/session.js` — per-attempt records (PRD §12, lab + gym) + session JSON export
- `api/` — key-hiding proxies: `transcribe` (Deepgram/AssemblyAI/Gemini/mock), `analyze-fillers`, `analyze-structure`, `analyze-framework`, `health`
- `src/components/` — Start, LabPick, Record (lab/retry/gym variants), Processing, Feedback, Delta, GymPick, GymFeedback
- `vite.config.js` — includes the dev API bridge that serves `api/` functions during `npm run dev`

## Deliberate scope notes

- Attempt 1 shows **no numbers** — grades surface only on the delta screen.
- Two separate metrics, never a composite score.
- The retry screen is bare on purpose: no transcript, no fix reminder (that's what H1/H2 test).
- The under-45s "Analyze it anyway" link is a demo convenience; pilot attempts below the minimum are unscored per PRD §8.1.
- The LLM prompts in `api/analyze-*.js` are working stand-ins — swap in the paste-ready prompts from the companion rubric files before Milestone 2 sign-off.
