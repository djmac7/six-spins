// Mirror the RevIQ-managed ads.txt into public/ads.txt. Single source of truth is the
// manager's per-publisher endpoint (managerdomain=rev.iq in the file itself); here we
// just fetch and write it, same tolerant pattern as sync-data / sync-design.
//
// This file feeds ad-serving authorization, so the fetch is *validated* before it is
// allowed to overwrite the committed copy: a truncated body, an HTML error page, or a
// non-2xx response leaves the existing file untouched (and exits non-zero so a workflow
// can see it) rather than nuking the publisher's monetization.
//
// Usage:  node scripts/sync-ads.mjs   (source overridable via ADS_TXT_SRC)
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = process.env.ADS_TXT_SRC || 'https://rev.iq/sixspins.com/ads.txt'
const MIN_RECORDS = 20 // guard against a truncated/error response replacing the real list

const here = dirname(fileURLToPath(import.meta.url))
const dest = process.env.ADS_TXT_DEST || join(here, '..', 'public', 'ads.txt')

// An ads.txt "record" line: exchange-domain, publisher-id, DIRECT|RESELLER[, cert-id].
// (Comments start with '#', variables are key=value like ownerdomain=…; neither counts.)
const RECORD_RE = /^[a-z0-9.-]+\s*,\s*[^,]+\s*,\s*(DIRECT|RESELLER)\b/i

function fail(msg) {
  console.error(`[sync-ads] ${msg}`)
  console.error('[sync-ads] keeping the committed public/ads.txt unchanged.')
  process.exit(1)
}

const res = await fetch(SRC, { headers: { accept: 'text/plain' } }).catch((e) => {
  fail(`fetch failed for ${SRC}: ${e.message}`)
})
if (!res.ok) fail(`fetch returned HTTP ${res.status} for ${SRC}`)

let body = await res.text()

// Reject obvious non-ads.txt payloads (proxy/error pages served with a 200).
if (/<!doctype html|<html[\s>]/i.test(body)) fail('response looks like an HTML page, not ads.txt')

const records = body.split(/\r?\n/).filter((l) => RECORD_RE.test(l.trim())).length
if (records < MIN_RECORDS) fail(`only ${records} ad records found (< ${MIN_RECORDS}); refusing to overwrite`)

// Soft sanity checks — warn, don't block (header format is the manager's to change).
if (!/managerdomain\s*=\s*rev\.iq/i.test(body)) console.warn('[sync-ads] WARN: no "managerdomain=rev.iq" line in fetched file')
if (!/ownerdomain\s*=\s*sixspins\.com/i.test(body)) console.warn('[sync-ads] WARN: no "ownerdomain=sixspins.com" line in fetched file')

// Normalize to LF + exactly one trailing newline (matches the committed file, so an
// unchanged upstream produces a byte-identical write and no spurious git churn).
body = body.replace(/\r\n/g, '\n').replace(/\n*$/, '\n')

const prev = existsSync(dest) ? readFileSync(dest, 'utf8') : ''
if (prev === body) {
  console.log(`[sync-ads] up to date (${records} records) — no change`)
  process.exit(0)
}

writeFileSync(dest, body)
console.log(`[sync-ads] updated public/ads.txt from ${SRC} (${records} records)`)
