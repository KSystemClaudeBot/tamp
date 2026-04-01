---
description: Show Tamp proxy status, active stages, and session compression stats
allowed-tools: Bash
---

Check the Tamp token compression proxy status. Run this command and report the output directly to the user:

```bash
curl -sf http://localhost:${TAMP_PORT:-7778}/health?text
```

If curl fails (empty output), report that Tamp is not running and suggest: `tamp -y` or `tamp install-service`

Show the output as-is. Do not reformat or add extra commentary.

$ARGUMENTS
