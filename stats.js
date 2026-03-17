export function formatRequestLog(stats, session) {
  const compressed = stats.filter(s => s.method)
  const skipped = stats.filter(s => s.skipped)
  const lines = [`[toona] POST /v1/messages — ${stats.length} blocks, ${compressed.length} compressed`]

  for (const s of stats) {
    if (s.skipped) {
      lines.push(`[toona]   block[${s.index}]: skipped (${s.skipped})`)
    } else if (s.method) {
      const pct = (((s.originalLen - s.compressedLen) / s.originalLen) * 100).toFixed(1)
      lines.push(`[toona]   block[${s.index}]: ${s.originalLen}->${s.compressedLen} chars (-${pct}%) [${s.method}]`)
    }
  }

  const totalOrig = compressed.reduce((a, s) => a + s.originalLen, 0)
  const totalComp = compressed.reduce((a, s) => a + s.compressedLen, 0)
  if (compressed.length > 0) {
    const pct = (((totalOrig - totalComp) / totalOrig) * 100).toFixed(1)
    lines.push(`[toona]   total: ${totalOrig}->${totalComp} chars (-${pct}%)`)
  }

  if (session) {
    const totals = session.getTotals()
    lines.push(`[toona]   session: ${totals.totalSaved} chars saved across ${totals.compressionCount} compressions`)
  }

  return lines.join('\n')
}

export function createSession() {
  let totalSaved = 0
  let compressionCount = 0

  return {
    record(stats) {
      for (const s of stats) {
        if (s.method && s.originalLen && s.compressedLen) {
          totalSaved += s.originalLen - s.compressedLen
          compressionCount++
        }
      }
    },
    getTotals() {
      return { totalSaved, compressionCount }
    },
  }
}
