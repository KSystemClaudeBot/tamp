export function loadConfig(env = process.env) {
  const stages = (env.TAMP_STAGES || 'minify,toon,strip-lines,whitespace,llmlingua,dedup,diff,prune').split(',').map(s => s.trim()).filter(Boolean)
  return Object.freeze({
    port: parseInt(env.TAMP_PORT, 10) || 7778,
    upstream: env.TAMP_UPSTREAM || 'https://api.anthropic.com',
    upstreams: Object.freeze({
      anthropic: env.TAMP_UPSTREAM || 'https://api.anthropic.com',
      openai: env.TAMP_UPSTREAM_OPENAI || 'https://api.openai.com',
      gemini: env.TAMP_UPSTREAM_GEMINI || 'https://generativelanguage.googleapis.com',
    }),
    minSize: parseInt(env.TAMP_MIN_SIZE, 10) || 200,
    stages,
    log: env.TAMP_LOG !== 'false',
    logFile: env.TAMP_LOG_FILE || null,
    maxBody: parseInt(env.TAMP_MAX_BODY, 10) || 10_485_760,
    cacheSafe: true,
    llmLinguaUrl: env.TAMP_LLMLINGUA_URL || null,
    textpressOllamaUrl: env.TAMP_TEXTPRESS_OLLAMA_URL || 'http://localhost:11434',
    textpressOllamaModel: env.TAMP_TEXTPRESS_OLLAMA_MODEL || 'qwen3.5:0.8b',
    textpressModel: env.TAMP_TEXTPRESS_MODEL || 'google/gemini-3.1-flash-lite-preview',
    textpressApiKey: env.TAMP_TEXTPRESS_API_KEY || env.OPENROUTER_API_KEY || null,
    tokenCost: parseFloat(env.TAMP_TOKEN_COST) || 3,
  })
}
