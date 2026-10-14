#!/usr/bin/env node
/**
 * cc-tamp.mjs — Claude Code entry point for Tamp with ratelimit capture.
 *
 * Usage: CC_LOG_DIR=/tmp/cc-proxy-logs/session_xxx node cc-tamp.mjs
 */
import { createProxy } from './index.js'
import { createResponseHook } from './cc-hooks.js'

const logDir = process.env.CC_LOG_DIR || null
const onResponse = createResponseHook({ logDir })

const { config, server } = createProxy({ onResponse })

server.listen(config.port, () => {
  console.error(`[cc-tamp] proxy on http://localhost:${config.port}`)
  console.error(`[cc-tamp] upstream: ${config.upstream}`)
  console.error(`[cc-tamp] stages: ${config.stages.join(', ')}`)
  if (logDir) console.error(`[cc-tamp] logs: ${logDir}`)
})
