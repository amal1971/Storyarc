#!/usr/bin/env node
// Evaluate the deterministic filler detector against hand-labelled fixtures.
// No network, no model — this scores exactly the code path that runs in the
// browser before any LLM is consulted. Prints precision / recall / F1 overall
// and per category, lists every miss, and exits non-zero if F1 drops below
// EVAL_MIN_F1 (default 0.85) so it can gate CI.
//
//   npm run eval
//
// Fixtures deliberately include two KNOWN LIMITATIONS (a context-blind "you
// know", an emphatic "no, no, no") so the reported number is honest rather than
// flattering. Tier B (model-adjudicated contextual fillers) is out of scope here.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { detectDeterministic } from '../src/lib/fillers.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixtures = JSON.parse(readFileSync(join(here, '..', 'eval', 'fixtures', 'fillers.json'), 'utf8'))
const MIN_F1 = Number(process.env.EVAL_MIN_F1 ?? 0.85)

const key = (e) => `${e.category}:${e.token.toLowerCase()}`

// Multiset match on (category, token). Span offsets are not compared — they are
// brittle across punctuation and not what a user sees.
function score(expected, actual) {
  const pool = new Map()
  for (const e of expected) pool.set(key(e), (pool.get(key(e)) || 0) + 1)
  let tp = 0
  const fp = []
  for (const a of actual) {
    const k = key(a)
    if (pool.get(k) > 0) { tp++; pool.set(k, pool.get(k) - 1) }
    else fp.push(k)
  }
  const fn = [...pool.entries()].flatMap(([k, n]) => Array(n).fill(k))
  return { tp, fp, fn }
}

let TP = 0, FP = 0, FN = 0
const perCat = {}
const rows = []
for (const f of fixtures) {
  const actual = detectDeterministic(f.transcript).map((e) => ({ token: e.token, category: e.category }))
  const { tp, fp, fn } = score(f.expected, actual)
  TP += tp; FP += fp.length; FN += fn.length
  for (const e of f.expected) { perCat[e.category] ??= { tp: 0, fn: 0, fp: 0 }; }
  for (const a of actual) { perCat[a.category] ??= { tp: 0, fn: 0, fp: 0 }; }
  // per-category tallies
  const seen = new Map()
  for (const e of f.expected) seen.set(key(e), (seen.get(key(e)) || 0) + 1)
  for (const a of actual) {
    const k = key(a)
    if (seen.get(k) > 0) { perCat[a.category].tp++; seen.set(k, seen.get(k) - 1) } else perCat[a.category].fp++
  }
  for (const [k, n] of seen) if (n > 0) perCat[k.split(':')[0]].fn += n
  rows.push({ id: f.id, tp, fp, fn, note: f.note })
}

const P = TP / Math.max(1, TP + FP)
const R = TP / Math.max(1, TP + FN)
const F1 = P + R === 0 ? 0 : (2 * P * R) / (P + R)
const pct = (x) => (x * 100).toFixed(1).padStart(5) + '%'

console.log(`\nStoryArc — deterministic filler detector eval (${fixtures.length} fixtures)\n`)
console.log('fixture'.padEnd(36), 'tp', 'fp', 'fn')
for (const r of rows) {
  const flag = r.fp.length || r.fn.length ? ' ◀' : ''
  console.log(r.id.padEnd(36), String(r.tp).padStart(2), String(r.fp.length).padStart(2), String(r.fn.length).padStart(2), flag)
  for (const k of r.fp) console.log('   false positive:', k)
  for (const k of r.fn) console.log('   missed:        ', k)
}
console.log('\nper category'.padEnd(20), 'precision', 'recall')
for (const [c, v] of Object.entries(perCat)) {
  const p = v.tp / Math.max(1, v.tp + v.fp), r = v.tp / Math.max(1, v.tp + v.fn)
  console.log(c.padEnd(20), pct(p).padStart(9), pct(r).padStart(7))
}
console.log(`\noverall  precision ${pct(P)}  recall ${pct(R)}  F1 ${pct(F1)}   (gate: F1 ≥ ${(MIN_F1 * 100).toFixed(0)}%)\n`)

if (F1 < MIN_F1) { console.error(`FAIL: F1 ${pct(F1)} below gate`); process.exit(1) }
