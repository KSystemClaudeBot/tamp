import { encode } from '@toon-format/toon'
import { countTokens } from '@anthropic-ai/tokenizer'
import { tryParseJSON, classifyContent, stripLineNumbers } from './detect.js'

export function compressText(text, config) {
  if (text.length < config.minSize) return null
  const cls = classifyContent(text)
  if (cls === 'toon') return null
  if (cls === 'text') {
    if (config.stages.includes('llmlingua') && config.llmLinguaUrl) {
      return { async: true, text, cls }
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
  const sync = compressText(text, config)
  if (sync && sync.async) {
    return compressWithLLMLingua(text, config)
  }
  return sync
}

export async function compressMessages(body, config) {
  const stats = []
  if (!body?.messages?.length) return { body, stats }

  let lastUserIdx = -1
  for (let i = body.messages.length - 1; i >= 0; i--) {
    if (body.messages[i].role === 'user') { lastUserIdx = i; break }
  }
  if (lastUserIdx === -1) return { body, stats }

  const msg = body.messages[lastUserIdx]
  const debug = config.log

  if (typeof msg.content === 'string') {
    const result = await compressBlock(msg.content, config)
    if (result) {
      msg.content = result.text
      stats.push({ index: lastUserIdx, ...result })
    }
  } else if (Array.isArray(msg.content)) {
    for (let i = 0; i < msg.content.length; i++) {
      const block = msg.content[i]
      if (block.type !== 'tool_result') continue
      if (block.is_error) { stats.push({ index: i, skipped: 'error' }); continue }

      if (typeof block.content === 'string') {
        if (debug) {
          const cls = classifyContent(block.content)
          const len = block.content.length
          console.error(`[toona] debug block[${i}]: type=${cls} len=${len} tool_use_id=${block.tool_use_id || '?'}`)
        }
        const result = await compressBlock(block.content, config)
        if (result) { block.content = result.text; stats.push({ index: i, ...result }) }
      } else if (Array.isArray(block.content)) {
        for (const sub of block.content) {
          if (sub.type === 'text') {
            if (debug) {
              const cls = classifyContent(sub.text)
              const len = sub.text.length
              console.error(`[toona] debug sub-block: type=${cls} len=${len}`)
            }
            const result = await compressBlock(sub.text, config)
            if (result) { sub.text = result.text; stats.push({ index: i, ...result }) }
          }
        }
      }
    }
  }

  return { body, stats }
}
