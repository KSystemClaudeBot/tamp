# Tamp + OpenClaw: Token Compression Setup

Save 3-50% on input tokens by routing API requests through [Tamp](https://github.com/sliday/tamp) — a local HTTP proxy that compresses tool_result blocks before they reach Anthropic.

## 1. Install & Run

```bash
npm i -g @sliday/tamp
TAMP_STAGES=minify,toon,strip-lines,whitespace,dedup,diff,prune tamp -y
```

Verify:

```bash
curl http://localhost:7778/health
# {"status":"ok","version":"0.3.8","stages":["minify","toon",...]}
```

## 2. Run as systemd service

Create `~/.config/systemd/user/tamp.service`:

```ini
[Unit]
Description=Tamp token compression proxy
After=network.target

[Service]
ExecStart=/usr/local/bin/tamp
Restart=always
RestartSec=5
Environment=TAMP_PORT=7778
Environment=TAMP_STAGES=minify,toon,strip-lines,whitespace,dedup,diff,prune
Environment=TAMP_LOG=true

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now tamp.service
journalctl --user -u tamp -f  # live compression logs
```

## 3. Configure OpenClaw

Add a provider in your OpenClaw config:

```json5
{
  models: {
    providers: {
      "anthropic-tamp": {
        baseUrl: "http://localhost:7778",
        apiKey: "${ANTHROPIC_API_KEY}",
        api: "anthropic-messages",
        models: [
          { id: "claude-opus-4-6", name: "Claude Opus 4.6 (compressed)" },
          { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6 (compressed)" }
        ]
      }
    }
  }
}
```

Set as primary model:

```json5
{
  agents: {
    defaults: {
      model: {
        primary: "anthropic-tamp/claude-opus-4-6"
      }
    }
  }
}
```

Restart the gateway. All requests now flow through Tamp.

## How it works

```
OpenClaw → POST /v1/messages → Tamp (localhost:7778) → compresses JSON body → Anthropic API
                                                     ← streams response back unchanged
```

Tamp intercepts the request body, finds `tool_result` blocks in `messages[]`, and compresses their content. The response streams back untouched.

## 7 Compression Stages

| Stage | What it does |
|-------|-------------|
| minify | Strip JSON whitespace |
| toon | Columnar encoding for arrays (file listings, deps, routes) |
| strip-lines | Remove line-number prefixes from Read tool output |
| whitespace | Collapse blank lines, trim trailing spaces |
| dedup | Deduplicate identical tool_results across turns |
| diff | Delta-encode similar re-reads as unified diffs |
| prune | Strip lockfile hashes, registry URLs, npm metadata |

Source code and natural language text pass through unchanged.

## What to expect

| Scenario | Savings | Notes |
|----------|---------|-------|
| Telegram chat (short turns) | 3-5% | Mostly text, few tool calls |
| Coding sessions (file reads, JSON) | 30-50% | Heavy tool_result compression |
| Lockfiles | up to 81% | Prune strips hashes and URLs |
| Subagent tasks | 20-40% | Depends on file exploration |

## Resources

- **RAM:** ~70MB
- **Latency:** <5ms per request
- **No Python needed** — all 7 stages run in Node.js
- **Fallback:** If Tamp goes down, add Anthropic direct as a fallback model in OpenClaw — requests bypass it automatically

## Links

- https://tamp.dev
- https://github.com/sliday/tamp
- [White paper (PDF)](https://tamp.dev/whitepaper.pdf)
