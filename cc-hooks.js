/**
 * cc-hooks.js — Ratelimit capture + request logging for Claude Code statusline.
 *
 * Mirrors the behavior of cc-filter-anthropic.py (mitmproxy addon):
 *   - Extracts anthropic-ratelimit-unified-* headers from responses
 *   - Writes /tmp/claude-ratelimit.json (consumed by statusline.sh)
 *   - Optionally logs per-request JSON files
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'set-cookie'])

function maskSensitive(headers) {
  const masked = {}
  for (const [k, v] of Object.entries(headers)) {
    if (SENSITIVE_HEADERS.has(k.toLowerCase())) {
      const parts = String(v).split(' ', 2)
      masked[k] = parts.length === 2 ? `${parts[0]} ***MASKED***` : '***MASKED***'
    } else {
      masked[k] = v
    }
  }
  return masked
}

function formatTimezone() {
  const now = new Date()
  const offset = -now.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const hh = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')
  const mm = String(Math.abs(offset) % 60).padStart(2, '0')
  return `${sign}${hh}${mm}`
}

export function createResponseHook(options = {}) {
  const cacheFile = options.cacheFile || process.env.CC_RL_CACHE || '/tmp/claude-ratelimit.json'
  const statsFile = options.statsFile || process.env.CC_TAMP_STATS || '/tmp/claude-tamp-stats.json'
  const logDir = options.logDir || process.env.CC_LOG_DIR || null
  const enableLog = options.enableLog ?? (process.env.CC_LOG_REQUESTS !== 'false')
  let counter = 0

  if (logDir && !existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true })
  }

  return (responseHeaders, requestInfo, sessionTotals) => {
    const hdrs = responseHeaders || {}

    // Extract ratelimit headers
    const rlHeaders = {}
    for (const [k, v] of Object.entries(hdrs)) {
      if (k.toLowerCase().includes('ratelimit')) {
        rlHeaders[k] = v
      }
    }

    // Update ratelimit cache
    if (Object.keys(rlHeaders).length > 0) {
      const tz = formatTimezone()
      const ts = new Date().toISOString().replace(/\.\d{3}Z$/, tz)
      const cache = {
        updated_at: ts,
        '5h_utilization': parseFloat(rlHeaders['anthropic-ratelimit-unified-5h-utilization'] || '0'),
        '5h_reset': parseInt(rlHeaders['anthropic-ratelimit-unified-5h-reset'] || '0', 10),
        '7d_utilization': parseFloat(rlHeaders['anthropic-ratelimit-unified-7d-utilization'] || '0'),
        '7d_reset': parseInt(rlHeaders['anthropic-ratelimit-unified-7d-reset'] || '0', 10),
        status: rlHeaders['anthropic-ratelimit-unified-status'] || 'unknown',
      }
      try {
        writeFileSync(cacheFile, JSON.stringify(cache, null, 2))
      } catch { /* best effort */ }
    }

    // Update tamp stats cache
    if (sessionTotals) {
      const ratio = sessionTotals.totalOriginal > 0
        ? (sessionTotals.totalSaved / sessionTotals.totalOriginal * 100)
        : 0
      const stats = {
        updated_at: new Date().toISOString(),
        ratio: Math.round(ratio * 10) / 10,
        tokens_saved: sessionTotals.totalTokensSaved || 0,
        chars_saved: sessionTotals.totalSaved || 0,
        chars_original: sessionTotals.totalOriginal || 0,
        requests: sessionTotals.requestCount || 0,
      }
      try {
        writeFileSync(statsFile, JSON.stringify(stats, null, 2))
      } catch { /* best effort */ }
    }

    // Per-request logging
    if (enableLog && logDir) {
      counter++
      const now = new Date()
      const hh = String(now.getHours()).padStart(2, '0')
      const mm = String(now.getMinutes()).padStart(2, '0')
      const ss = String(now.getSeconds()).padStart(2, '0')
      const timestamp = `${hh}${mm}${ss}`
      const prefix = `${String(counter).padStart(4, '0')}_${timestamp}`
      const safePath = (requestInfo.path || '').replace(/\//g, '_')

      const entry = {
        request: {
          method: requestInfo.method,
          url: requestInfo.url,
          path: requestInfo.path,
        },
        response: {
          status_code: requestInfo.statusCode,
          headers: maskSensitive(hdrs),
        },
      }
      if (Object.keys(rlHeaders).length > 0) {
        entry.ratelimit = rlHeaders
      }

      try {
        const logPath = join(logDir, `${prefix}_${requestInfo.method}_${safePath}.json`)
        writeFileSync(logPath, JSON.stringify(entry, null, 2))
      } catch { /* best effort */ }
    }
  }
}
