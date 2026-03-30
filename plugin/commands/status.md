---
description: Show Tamp proxy status, active stages, and session compression stats
allowed-tools: Bash
---

Check the Tamp token compression proxy status. Run this command and report results concisely:

```bash
curl -sf http://localhost:${TAMP_PORT:-7778}/health | python3 -m json.tool
```

If healthy, show:
- Version and active stages count
- **Session savings**: requests processed, tokens saved, chars saved, compression ratio (charsSaved/charsOriginal as %). If tokensSaved > 0, also show estimated dollar savings at $3/Mtok (Sonnet) and $5/Mtok (Opus).
- If session.requests is 0, note "No requests yet"

If not healthy, report that Tamp is not running and suggest: `tamp -y` or `tamp install-service`

$ARGUMENTS
