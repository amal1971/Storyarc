#!/usr/bin/env node
// Give one account its 30 minutes back.
//
//   node scripts/reset-usage.mjs someone@gmail.com
//
// Deliberately a local script, not an admin endpoint: it needs the Upstash
// credentials that already live in .env.local, so supporting one-off resets
// adds no public attack surface and no new secret.
//
// Usage is keyed by the opaque Google `sub`, so this goes through the
// email → sub index that _usage.js writes alongside every record.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

// No dotenv dependency in this repo; the format we need is one KEY=value a line.
try {
  const raw = readFileSync(join(here, '..', '.env.local'), 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!m) continue
    const value = m[2].replace(/\s+#.*$/, '').replace(/^["']|["']$/g, '')
    if (value && !(m[1] in process.env)) process.env[m[1]] = value
  }
} catch {
  // Fall through: the vars may already be exported in the shell.
}

const { subForEmail, deleteUsage, getUsage, usageConfigured } = await import('../api/_usage.js')

const email = process.argv[2]
if (!email) {
  console.error('usage: node scripts/reset-usage.mjs <email>')
  process.exit(1)
}
if (!usageConfigured()) {
  console.error('UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set (.env.local)')
  process.exit(1)
}

const sub = await subForEmail(email)
if (!sub) {
  console.error(`no usage record indexed for ${email} — nothing to reset`)
  process.exit(1)
}

const record = await getUsage(sub)
await deleteUsage(sub, email)
const used = Math.round((record?.usedSeconds || 0) / 60)
console.log(`reset ${email} (sub ${sub}) — cleared ${used} min used${record?.exhausted ? ', was locked out' : ''}`)
console.log('they now get a fresh allowance on next sign-in.')
