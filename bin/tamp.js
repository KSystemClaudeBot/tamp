#!/usr/bin/env node
import { createProxy } from '../index.js'
import { existsSync, readFileSync } from 'node:fs'
import { spawn, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { checkbox, Separator } from '@inquirer/prompts'
import http from 'node:http'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m',
  magenta: '\x1b[35m', cyan: '\x1b[36m', bgGreen: '\x1b[42m', red: '\x1b[31m',
}
function log(msg = '') { console.error(msg) }

const DEFAULT_STAGES = ['minify', 'toon', 'strip-lines', 'whitespace', 'llmlingua', 'dedup', 'diff', 'prune']
const EXTRA_STAGES = ['strip-comments', 'textpress']

const STAGE_DESC = {
  minify:           'Strip JSON whitespace (lossless)',
  toon:             'Columnar array encoding (lossless)',
  'strip-lines':    'Remove line-number prefixes',
  whitespace:       'Collapse blank lines, trim trailing',
  llmlingua:        'Neural compression via LLMLingua-2',
  dedup:            'Deduplicate identical tool_results',
  diff:             'Replace similar re-reads with diffs',
  prune:            'Strip lockfile hashes & npm metadata',
  'strip-comments': 'Remove code comments (lossy)',
  textpress:        'LLM semantic compression (Ollama/OpenRouter)',
}

// --- Determine stages ---
const skipPrompt = process.argv.includes('-y') || process.argv.includes('--no-interactive') || !process.stdin.isTTY
let selectedStages

// Determine pre-checked stages from env var (if set)
const envStages = process.env.TAMP_STAGES
  ? new Set(process.env.TAMP_STAGES.split(',').map(s => s.trim()).filter(Boolean))
  : null

if (skipPrompt) {
  selectedStages = envStages ? [...envStages] : [...DEFAULT_STAGES]
} else {
  log('')
  log(`  ${c.bold}${c.cyan}Tamp${c.reset} ${c.dim}v${pkg.version}${c.reset}`)
  log(`  ${c.dim}Token compression proxy for coding agents${c.reset}`)
  log('')

  selectedStages = await checkbox({
    message: 'Select compression stages:',
    choices: [
      new Separator(`${c.dim}── Default (lossless) ──${c.reset}`),
      ...DEFAULT_STAGES.map(s => ({
        name: `${c.cyan}${s.padEnd(15)}${c.reset} ${c.dim}${STAGE_DESC[s]}${c.reset}`,
        value: s,
        checked: envStages ? envStages.has(s) : true,
      })),
      new Separator(`${c.dim}── Extra (lossy, opt-in) ──${c.reset}`),
      ...EXTRA_STAGES.map(s => ({
        name: `${c.yellow}${s.padEnd(15)}${c.reset} ${c.dim}${STAGE_DESC[s]}${c.reset}`,
        value: s,
        checked: envStages ? envStages.has(s) : false,
      })),
    ],
    pageSize: 15,
    loop: false,
  })

  if (selectedStages.length === 0) {
    log(`\n  ${c.red}No stages selected. At least one is required.${c.reset}`)
    process.exit(1)
  }
}

process.env.TAMP_STAGES = selectedStages.join(',')

// --- Sidecar startup ---
let sidecarProc = null

async function checkPort(port) {
  return new Promise(resolve => {
    const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
      res.resume(); resolve(res.statusCode === 200)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(1000, () => { req.destroy(); resolve(false) })
  })
}

function hasCommand(cmd) {
  try { execFileSync('which', [cmd], { stdio: 'ignore' }); return true } catch { return false }
}

async function startSidecar() {
  const sidecarPort = 8788
  const sidecarDir = join(root, 'sidecar')
  const serverPy = join(sidecarDir, 'server.py')

  if (await checkPort(sidecarPort)) {
    log(`  ${c.green}✓${c.reset} LLMLingua-2 sidecar already running on :${sidecarPort}`)
    return `http://localhost:${sidecarPort}`
  }
  if (!existsSync(serverPy)) return null

  log(`  ${c.yellow}→${c.reset} Starting LLMLingua-2 sidecar ...`)

  if (hasCommand('uv')) {
    try {
      const proc = spawn('uv', [
        'run', '--with', 'fastapi', '--with', 'uvicorn', '--with', 'llmlingua', '--with', 'mlx',
        'uvicorn', 'server:app', '--host', '127.0.0.1', '--port', String(sidecarPort),
      ], { cwd: sidecarDir, stdio: ['ignore', 'pipe', 'pipe'] })
      const url = await waitForSidecar(proc, sidecarPort)
      if (url) { sidecarProc = proc; return url }
      proc.kill()
    } catch { /* try next */ }
  }

  const venvPython = join(sidecarDir, '.venv', 'bin', 'python')
  if (existsSync(venvPython)) {
    try {
      const proc = spawn(venvPython, [
        '-m', 'uvicorn', 'server:app', '--host', '127.0.0.1', '--port', String(sidecarPort),
      ], { cwd: sidecarDir, stdio: ['ignore', 'pipe', 'pipe'] })
      const url = await waitForSidecar(proc, sidecarPort)
      if (url) { sidecarProc = proc; return url }
      proc.kill()
    } catch { /* fall through */ }
  }
  return null
}

function waitForSidecar(proc, port, timeout = 30000) {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), timeout)
    proc.stderr.on('data', (d) => {
      if (d.toString().includes('Uvicorn running')) {
        clearTimeout(timer)
        log(`  ${c.green}✓${c.reset} LLMLingua-2 ready on :${c.bold}${port}${c.reset}`)
        resolve(`http://localhost:${port}`)
      }
    })
    proc.on('exit', () => { clearTimeout(timer); resolve(null) })
  })
}

if (selectedStages.includes('llmlingua')) {
  const sidecarUrl = await startSidecar()
  if (sidecarUrl) {
    process.env.TAMP_LLMLINGUA_URL = sidecarUrl
  } else {
    log(`  ${c.yellow}!${c.reset} LLMLingua-2 not available`)
    if (!hasCommand('uv')) log(`    ${c.dim}Install uv: curl -LsSf https://astral.sh/uv/install.sh | sh${c.reset}`)
    log(`    ${c.dim}Continuing without neural compression.${c.reset}`)
    selectedStages = selectedStages.filter(s => s !== 'llmlingua')
    process.env.TAMP_STAGES = selectedStages.join(',')
  }
}

// --- Start proxy ---
const { config, server } = createProxy()

function printBanner() {
  const url = `http://localhost:${config.port}`
  const active = config.stages
  const defaultActive = active.filter(s => DEFAULT_STAGES.includes(s))
  const extraActive = active.filter(s => EXTRA_STAGES.includes(s))

  log('')
  log(`  ${c.cyan}${c.bold}Tamp${c.reset} ${c.dim}v${pkg.version}${c.reset}  ${c.bgGreen}${c.bold} READY ${c.reset}  ${c.green}${url}${c.reset}`)
  log('')
  log(`  ${c.bold}Setup:${c.reset}`)
  log(`    ${c.dim}Claude Code:${c.reset}  ANTHROPIC_BASE_URL=${c.yellow}${url}${c.reset}`)
  log(`    ${c.dim}Aider/Cursor:${c.reset} OPENAI_BASE_URL=${c.yellow}${url}${c.reset}`)
  log('')

  log(`  ${c.bold}Stages${c.reset} ${c.dim}(${active.length} active)${c.reset}`)
  for (const s of defaultActive) {
    const extra = s === 'llmlingua' && config.llmLinguaUrl ? ` ${c.dim}(${config.llmLinguaUrl})${c.reset}` : ''
    log(`    ${c.green}✓${c.reset} ${c.cyan}${s}${c.reset}${extra}`)
  }
  if (extraActive.length) {
    for (const s of extraActive) {
      log(`    ${c.yellow}✓${c.reset} ${c.yellow}${s}${c.reset} ${c.dim}(lossy)${c.reset}`)
    }
  }
  const disabled = [...DEFAULT_STAGES, ...EXTRA_STAGES].filter(s => !active.includes(s))
  if (disabled.length && disabled.length <= 4) {
    log(`    ${c.dim}✗ ${disabled.join(', ')}${c.reset}`)
  }
  log('')
}

server.listen(config.port, () => { printBanner() })

process.on('exit', () => sidecarProc?.kill())
process.on('SIGINT', () => { sidecarProc?.kill(); process.exit() })
process.on('SIGTERM', () => { sidecarProc?.kill(); process.exit() })
