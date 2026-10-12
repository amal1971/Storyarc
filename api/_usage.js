// Lifetime usage records in Upstash Redis — the only server-side storage in
// this app, and it holds nothing but an opaque Google id and a second count.
// Practice data stays in the browser.
//
// Two keys per user: the primary record by Google `sub`, and an email → sub
// index so "reset this person's timer" is a lookup by the thing you actually
// know (see scripts/reset-usage.mjs). No TTL — the cap is lifetime.
import { Redis } from '@upstash/redis'

export class UsageStoreUnavailableError extends Error {
  constructor(message) {
    super(message)
    this.name = 'UsageStoreUnavailableError'
  }
}

export const usageConfigured = () =>
  Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)

let client = null

// Lazy: constructing at import time would throw in a repo that hasn't been
// pointed at an Upstash database yet, taking down every endpoint with it.
function redis() {
  if (!usageConfigured()) {
    throw new UsageStoreUnavailableError('UPSTASH_REDIS_REST_URL / _TOKEN not set')
  }
  if (!client) {
    client = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  }
  return client
}

const usageKey = (sub) => `storyarc:usage:${sub}`
const emailKey = (email) => `storyarc:usage:by-email:${String(email || '').toLowerCase()}`

export async function getUsage(sub) {
  const raw = await redis().get(usageKey(sub))
  if (!raw) return null
  return typeof raw === 'string' ? JSON.parse(raw) : raw
}

// `indexEmail` writes the email → sub lookup. Only login needs it (the index
// never changes afterwards); skipping it on every 15–30 s checkpoint halves
// the Redis commands the countdown costs.
export async function saveUsage(sub, { email, usedSeconds, exhausted = false, indexEmail = false }) {
  const record = { sub, email: email || null, usedSeconds, exhausted, updatedAt: Date.now() }
  await redis().set(usageKey(sub), record)
  if (email && indexEmail) await redis().set(emailKey(email), sub)
  return record
}

// Paid-call counters: one lifetime count per account and one per UTC day for
// the whole app. Time is not enough of a cap on its own — a script can fire
// many calls a second inside the allowance.
const callsKey = (sub) => `storyarc:calls:${sub}`
const dayKey = () => `storyarc:calls:day:${new Date().toISOString().slice(0, 10)}`

export async function countPaidCall(sub) {
  const r = redis()
  const day = dayKey()
  const [account, today] = await Promise.all([r.incr(callsKey(sub)), r.incr(day)])
  if (today === 1) await r.expire(day, 60 * 60 * 48)
  return { account, today }
}

// Undo one countPaidCall: used when a call was refused by a cap (it never ran)
// or failed upstream (the user got nothing for it). Best-effort by design.
export async function refundPaidCall(sub) {
  const r = redis()
  await Promise.all([r.decr(callsKey(sub)), r.decr(dayKey())])
}

export async function markExhausted(sub, email) {
  const prior = await getUsage(sub).catch(() => null)
  return saveUsage(sub, {
    email: email || prior?.email,
    usedSeconds: Math.max(prior?.usedSeconds || 0, Number(process.env.USAGE_LIMIT_MINUTES || 30) * 60),
    exhausted: true,
  })
}

export async function subForEmail(email) {
  return redis().get(emailKey(email))
}

export async function deleteUsage(sub, email) {
  await redis().del(usageKey(sub))
  await redis().del(callsKey(sub))
  if (email) await redis().del(emailKey(email))
}
