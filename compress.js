import { encode } from '@toon-format/toon'
import { countTokens } from '@anthropic-ai/tokenizer'
import { tryParseJSON, classifyContent, stripLineNumbers } from './detect.js'
import { anthropic } from './providers.js'

const cache = new Map()
const MAX_CACHE = 500

function cacheKey(text) {
  if (text.length < 128) return text
  return `${text.length}:${text.slice(0, 64)}:${text.slice(-64)}`
}

export function clearCache() { cache.clear() }

function normalizeWhitespace(text) {
  return text
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
}

export function compressText(text, config) {
  if (text.length < config.minSize) return null
  const cls = classifyContent(text)
  if (cls === 'toon') return null

  if (cls === 'text') {
    let processed = text
    if (config.stages.includes('strip-lines')) {
      const stripped = stripLineNumbers(text)
      if (stripped !== text) processed = stripped
    }
    if (config.stages.includes('whitespace')) {
      processed = normalizeWhitespace(processed)
    }
    if (processed.length < text.length * 0.9) {
      return { text: processed, method: 'normalize', originalLen: text.length, compressedLen: processed.length, originalTokens: countTokens(text), compressedTokens: countTokens(processed) }
    }
    if (config.stages.includes('llmlingua') && config.llmLinguaUrl) {
      return { async: true, text: processed, cls }
    }
    return null
  }

  if (cls !== 'json' && cls !== 'json-lined') return null

  const raw = cls === 'json-lined' ? stripLineNumbers(text) : text
  const { ok, value } = tryParseJSON(raw)
  if (!ok) return null

  const minified = JSON.stringify(value)
  if (minified.length >= text.length) return null

  let best = { text: minified, method: 'minify' }

  if (config.stages.includes('toon')) {
    try {
      const tooned = encode(value)
      if (tooned.length < best.text.length) {
        best = { text: tooned, method: 'toon' }
      }
    } catch { /* fall back to minified */ }
  }

  return { text: best.text, method: best.method, originalLen: text.length, compressedLen: best.text.length, originalTokens: countTokens(text), compressedTokens: countTokens(best.text) }
}

async function compressWithLLMLingua(text, config) {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(config.llmLinguaUrl + '/compress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, rate: 0.5 }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) return null
    const data = await res.json()
    return { text: data.text, method: 'llmlingua', originalLen: text.length, compressedLen: data.text.length, originalTokens: countTokens(text), compressedTokens: countTokens(data.text) }
  } catch {
    return null
  }
}

async function compressBlock(text, config) {
  const key = cacheKey(text)
  if (cache.has(key)) return cache.get(key)

  const sync = compressText(text, config)
  let result
  if (sync && sync.async) {
    result = await compressWithLLMLingua(sync.text, config)
  } else {
    result = sync
  }

  if (cache.size >= MAX_CACHE) {
    const firstKey = cache.keys().next().value
    cache.delete(firstKey)
  }
  cache.set(key, result)
  return result
}

export async function compressRequest(body, config, provider) {
  const targets = provider.extract(body)
  const stats = []
  for (const target of targets) {
    if (target.skip) { stats.push({ index: target.index, skipped: target.skip }); continue }
    const result = await compressBlock(target.text, config)
    if (result) {
      target.compressed = result.text
      stats.push({ index: target.index, ...result })
    } else {
      stats.push({ index: target.index, skipped: 'not-compressible' })
    }
  }
  provider.apply(body, targets)
  return { body, stats, targetCount: targets.length }
}

export async function compressMessages(body, config) {
  if (!body?.messages?.length) return { body, stats: [] }
  return compressRequest(body, config, anthropic)
}
