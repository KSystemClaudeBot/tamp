#!/usr/bin/env node
// A/B quality evaluation: compressed vs uncompressed responses must match
// Proves Tamp compression doesn't degrade LLM response quality
// Usage: OPENROUTER_API_KEY=... node bench/quality-eval.js

import { compressMessages, clearCache } from '../compress.js'
import { loadConfig } from '../config.js'
import { countTokens } from '@anthropic-ai/tokenizer'
import { writeFileSync, mkdirSync } from 'node:fs'

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
if (!OPENROUTER_API_KEY) {
  console.error('Set OPENROUTER_API_KEY to run quality evaluation')
  process.exit(1)
}

const MODEL = 'anthropic/claude-sonnet-4.6'
const ENDPOINT = 'https://openrouter.ai/api/v1/messages'
const RUNS = 3
const SLEEP_MS = 500

const config = loadConfig({
  TAMP_STAGES: 'minify,toon,strip-lines,whitespace',
  TAMP_MIN_SIZE: '10',
  TAMP_LOG: 'false',
})

const sleep = ms => new Promise(r => setTimeout(r, ms))

// Test scenarios: each has tool_result content, a question, and expected answer
const scenarios = [
  {
    id: 'function-name',
    question: 'What is the exported function name for deleting a user? Reply with just the function name.',
    expected: 'deleteUserAccount',
    match: 'exact',
    content: `export async function deleteUserAccount(userId: string, reason: string) {
  const user = await db.users.findById(userId);
  if (!user) throw new NotFoundError('User not found');
  await db.sessions.deleteMany({ userId });
  await db.users.delete(userId);
  await auditLog.record({ action: 'DELETE_USER', userId, reason });
  return { deleted: true, userId };
}

export async function suspendUserAccount(userId: string) {
  await db.users.update(userId, { status: 'suspended' });
}

export function getUserProfile(userId: string) {
  return db.users.findById(userId);
}`,
  },
  {
    id: 'config-port',
    question: 'What port does the database run on? Reply with just the number.',
    expected: '5432',
    match: 'exact',
    content: JSON.stringify({
      database: { host: 'db.prod.internal', port: 5432, name: 'myapp_production', pool: { min: 5, max: 25 } },
      redis: { host: 'cache.prod.internal', port: 6379, db: 0 },
      server: { port: 3000, workers: 4, gracefulShutdown: 30000 },
    }, null, 2),
  },
  {
    id: 'list-methods',
    question: 'List all unique HTTP methods used in these routes. Reply with a comma-separated list.',
    expected: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    match: 'set',
    content: JSON.stringify([
      { method: 'GET', path: '/api/users', handler: 'list' },
      { method: 'POST', path: '/api/users', handler: 'create' },
      { method: 'GET', path: '/api/users/:id', handler: 'show' },
      { method: 'PUT', path: '/api/users/:id', handler: 'update' },
      { method: 'DELETE', path: '/api/users/:id', handler: 'destroy' },
      { method: 'PATCH', path: '/api/users/:id/status', handler: 'updateStatus' },
      { method: 'GET', path: '/api/health', handler: 'healthCheck' },
    ], null, 2),
  },
  {
    id: 'reasoning',
    question: 'If loading is true and hasMore is true, will loadMore() increment the page? Answer Yes or No.',
    expected: 'No',
    match: 'exact',
    content: `const loadMore = useCallback(() => {
  if (!loading && hasMore) {
    setPage(p => p + 1);
  }
}, [loading, hasMore]);

const canLoadMore = !loading && hasMore && items.length > 0;`,
  },
  {
    id: 'line-numbered',
    question: 'What web framework is imported on the first line? Reply with just the name.',
    expected: 'express',
    match: 'exact',
    content: [
      '  1→import express from \'express\';',
      '  2→import cors from \'cors\';',
      '  3→import helmet from \'helmet\';',
      '  4→',
      '  5→const app = express();',
      '  6→app.use(cors());',
      '  7→app.use(helmet());',
      '  8→app.use(express.json());',
      '  9→',
      ' 10→app.get(\'/api/health\', (req, res) => {',
      ' 11→  res.json({ status: \'ok\' });',
      ' 12→});',
    ].join('\n'),
  },
  {
    id: 'test-count',
    question: 'How many tests passed in total? Reply with just the number.',
    expected: '12',
    match: 'exact',
    content: 'Running tests...   \n\n\n\n  PASS  src/utils/format.test.ts    \n    ✓ formats currency correctly (3ms)   \n    ✓ handles negative values    \n    ✓ respects locale settings   \n\n\n\n  PASS  src/utils/validate.test.ts    \n    ✓ validates email format (1ms)    \n    ✓ rejects invalid emails    \n    ✓ validates phone numbers    \n    ✓ handles edge cases    \n\n\n\n  PASS  src/components/UserList.test.tsx    \n    ✓ renders user list (12ms)   \n    ✓ handles empty state    \n    ✓ pagination works    \n    ✓ search filters correctly (5ms)    \n    ✓ sort toggles direction    \n\n\n\nTest Suites: 3 passed, 3 total    \nTests:       12 passed, 12 total    \nTime:        2.847s    \n\n\n',
  },
  {
    id: 'dep-check',
    question: 'Is "lodash" listed as a dependency? Answer Yes or No.',
    expected: 'No',
    match: 'exact',
    content: JSON.stringify({
      name: 'my-app',
      dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0', axios: '^1.6.0', zustand: '^4.4.0' },
      devDependencies: { vite: '^5.0.0', vitest: '^1.0.0', eslint: '^8.55.0', prettier: '^3.1.0' },
    }, null, 2),
  },
  {
    id: 'multi-fact',
    question: null, // uses sub-questions
    match: 'multi',
    threshold: 4,
    content: 'Project: my-dashboard\nNode version: 18.19.0\nPackage manager: pnpm 8.12.1\nBuild tool: Vite 5.0.12\nFramework: React 18.2.0 with TypeScript 5.3.3\nTesting: Vitest 1.2.0 + React Testing Library 14.1.2\nState management: Zustand 4.4.7\nStyling: Tailwind CSS 3.4.1',
    questions: [
      { q: 'What Node version is used? Reply with just the version.', a: '18.19.0' },
      { q: 'What is the package manager? Reply with just the name.', a: 'pnpm' },
      { q: 'What framework is used? Reply with just the name.', a: 'React' },
      { q: 'What state management library? Reply with just the name.', a: 'Zustand' },
      { q: 'What CSS framework is used? Reply with just the name.', a: 'Tailwind' },
    ],
  },
]

function makeBody(content, question) {
  return {
    model: MODEL,
    max_tokens: 100,
    system: 'You are a precise assistant. Answer questions about the provided tool output concisely.',
    messages: [
      { role: 'user', content: 'Read the file' },
      { role: 'assistant', content: [
        { type: 'text', text: 'Reading.' },
        { type: 'tool_use', id: 'tu_eval', name: 'Read', input: { path: '/tmp/file' } },
      ]},
      { role: 'user', content: [
        { type: 'tool_result', tool_use_id: 'tu_eval', content },
      ]},
      { role: 'assistant', content: [{ type: 'text', text: 'I\'ve read the file. What would you like to know?' }] },
      { role: 'user', content: question },
    ],
  }
}

async function callAPI(body) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': OPENROUTER_API_KEY,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return {
    text: data.content?.[0]?.text?.trim() ?? '',
    input_tokens: data.usage?.input_tokens ?? 0,
  }
}

function checkAnswer(response, expected, matchType) {
  const resp = response.toLowerCase()
  if (matchType === 'exact') return resp.includes(expected.toLowerCase())
  if (matchType === 'set') return expected.filter(item => resp.toUpperCase().includes(item)).length >= expected.length * 0.8
  return false
}

async function runScenario(scenario) {
  const result = { id: scenario.id, control: { pass: 0, total: 0, tokens: 0 }, treatment: { pass: 0, total: 0, tokens: 0 } }

  if (scenario.match === 'multi') {
    let ctrlPass = 0, treatPass = 0
    for (const sub of scenario.questions) {
      // Control
      const ctrlBody = makeBody(scenario.content, sub.q)
      const ctrl = await callAPI(ctrlBody)
      result.control.tokens = ctrl.input_tokens
      if (ctrl.text.toLowerCase().includes(sub.a.toLowerCase())) ctrlPass++
      await sleep(SLEEP_MS)

      // Treatment
      clearCache()
      const treatBody = JSON.parse(JSON.stringify(ctrlBody))
      await compressMessages(treatBody, config)
      const treat = await callAPI(treatBody)
      result.treatment.tokens = treat.input_tokens
      if (treat.text.toLowerCase().includes(sub.a.toLowerCase())) treatPass++
      await sleep(SLEEP_MS)
    }
    result.control.pass = ctrlPass >= scenario.threshold ? 1 : 0
    result.control.total = 1
    result.control.detail = `${ctrlPass}/${scenario.questions.length}`
    result.treatment.pass = treatPass >= scenario.threshold ? 1 : 0
    result.treatment.total = 1
    result.treatment.detail = `${treatPass}/${scenario.questions.length}`
    return result
  }

  for (let r = 0; r < RUNS; r++) {
    // Control
    const ctrlBody = makeBody(scenario.content, scenario.question)
    const ctrl = await callAPI(ctrlBody)
    result.control.tokens = ctrl.input_tokens
    result.control.total++
    if (checkAnswer(ctrl.text, scenario.expected, scenario.match)) result.control.pass++
    await sleep(SLEEP_MS)

    // Treatment
    clearCache()
    const treatBody = JSON.parse(JSON.stringify(ctrlBody))
    await compressMessages(treatBody, config)
    const treat = await callAPI(treatBody)
    result.treatment.tokens = treat.input_tokens
    result.treatment.total++
    if (checkAnswer(treat.text, scenario.expected, scenario.match)) result.treatment.pass++
    await sleep(SLEEP_MS)
  }

  return result
}

const c = { reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m', dim: '\x1b[2m', bold: '\x1b[1m', yellow: '\x1b[33m' }

async function main() {
  console.log(`\n${c.bold}=== Tamp Quality Eval (A/B Response Equivalence) ===${c.reset}`)
  console.log(`Model: ${MODEL}`)
  console.log(`Stages: ${config.stages.join(', ')}`)
  console.log(`Runs per scenario: ${RUNS}\n`)

  let equiv = 0
  const results = []

  for (const scenario of scenarios) {
    process.stderr.write(`  ${scenario.id.padEnd(18)} `)
    const r = await runScenario(scenario)
    results.push(r)

    const isMulti = scenario.match === 'multi'
    const ctrlOk = r.control.pass >= (isMulti ? 1 : 2)
    const treatOk = r.treatment.pass >= (isMulti ? 1 : 2)
    const isEquiv = ctrlOk && treatOk

    const ctrlLabel = ctrlOk ? `${c.green}PASS${c.reset}` : `${c.red}FAIL${c.reset}`
    const treatLabel = treatOk ? `${c.green}PASS${c.reset}` : `${c.red}FAIL${c.reset}`
    const ctrlDetail = r.control.detail || `${r.control.pass}/${r.control.total}`
    const treatDetail = r.treatment.detail || `${r.treatment.pass}/${r.treatment.total}`
    const tokSaved = r.control.tokens > 0 ? ((1 - r.treatment.tokens / r.control.tokens) * 100).toFixed(0) : '?'
    const equivLabel = isEquiv ? `${c.green}✓ EQUIV${c.reset}` : `${c.red}✗ DIFF${c.reset}`

    if (isEquiv) equiv++

    console.log(`CTRL: ${ctrlLabel} (${ctrlDetail})  TREAT: ${treatLabel} (${treatDetail})  ${c.dim}tokens: ${r.control.tokens}→${r.treatment.tokens} (-${tokSaved}%)${c.reset}  ${equivLabel}`)
  }

  const passRate = equiv / scenarios.length
  console.log(`\n${equiv}/${scenarios.length} equivalent (${(passRate * 100).toFixed(0)}%)`)
  console.log(passRate >= 0.875 ? `${c.green}${c.bold}OVERALL: PASS${c.reset}` : `${c.red}${c.bold}OVERALL: FAIL (need >= 87.5%)${c.reset}`)

  mkdirSync('bench/results', { recursive: true })
  const outPath = `bench/results/quality-eval-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  writeFileSync(outPath, JSON.stringify({ timestamp: new Date().toISOString(), model: MODEL, stages: config.stages, scenarios: results, equivalenceRate: passRate }, null, 2))
  console.log(`\nResults: ${outPath}`)
}

main().catch(err => { console.error(err); process.exit(1) })
