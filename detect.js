export function tryParseJSON(str) {
  if (typeof str !== 'string' || str.length === 0) return { ok: false }
  try {
    const value = JSON.parse(str)
    return { ok: true, value }
  } catch {
    return { ok: false }
  }
}

export function isTOON(str) {
  if (typeof str !== 'string') return false
  const firstLine = str.trimStart().split('\n')[0]
  return /^\[TOON\]/.test(firstLine) || /\w+\[\d+\]\{/.test(firstLine) || /\w+\[\d+\]:/.test(firstLine)
}

export function classifyContent(str) {
  if (typeof str !== 'string') return 'unknown'
  if (isTOON(str)) return 'toon'
  const { ok } = tryParseJSON(str)
  if (ok) return 'json'
  if (str.length > 0) return 'text'
  return 'unknown'
}
