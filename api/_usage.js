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

export async function saveUsage(sub, { email, usedSeconds, exhausted = false }) {
  const record = { sub, email: email || null, usedSeconds, exhausted, updatedAt: Date.now() }
  await redis().set(usageKey(sub), record)
  if (email) await redis().set(emailKey(email), sub)
  return record
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
  if (email) await redis().del(emailKey(email))
}
