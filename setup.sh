#!/usr/bin/env bash
set -euo pipefail

# Tamp — Token Compression Proxy for Coding Agents
# curl -fsSL https://tamp.dev/setup.sh | bash

REPO="https://github.com/sliday/tamp.git"
DIR="${TAMP_DIR:-$HOME/.tamp}"
PORT="${TAMP_PORT:-7778}"

echo ""
echo "  ┌─────────────────────────────────┐"
echo "  │         Tamp Setup              │"
echo "  │  Token compression for agents   │"
echo "  └─────────────────────────────────┘"
echo ""

# Check deps
command -v node >/dev/null 2>&1 || { echo "  ✗ Error: node is required. Install from https://nodejs.org"; exit 1; }
command -v git >/dev/null 2>&1 || { echo "  ✗ Error: git is required."; exit 1; }
echo "  ✓ node $(node --version)"
echo "  ✓ git found"

# Clone or update
if [ -d "$DIR" ]; then
  echo ""
  echo "  → Updating existing install in $DIR"
  cd "$DIR" && git pull --quiet
  echo "  ✓ Updated"
else
  echo ""
  echo "  → Cloning to $DIR ..."
  git clone --quiet --depth 1 "$REPO" "$DIR"
  echo "  ✓ Cloned"
fi

cd "$DIR"

# Install deps (this is the slow part)
echo ""
echo "  → Installing dependencies (this may take a moment) ..."
npm install --silent 2>/dev/null &
NPM_PID=$!
SPINNER="⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"
i=0
while kill -0 $NPM_PID 2>/dev/null; do
  printf "\r  %s Installing ..." "${SPINNER:$((i % ${#SPINNER})):1}"
  i=$((i + 1))
  sleep 0.1
done
wait $NPM_PID
printf "\r  ✓ Dependencies installed       \n"

# Detect shell
SHELL_NAME=$(basename "${SHELL:-/bin/sh}")
case "$SHELL_NAME" in
  zsh)  PROFILE="$HOME/.zshrc" ;;
  bash)
    if [ -f "$HOME/.bash_profile" ]; then
      PROFILE="$HOME/.bash_profile"
    else
      PROFILE="$HOME/.bashrc"
    fi
    ;;
  fish) PROFILE="$HOME/.config/fish/config.fish" ;;
  *)    PROFILE="$HOME/.profile" ;;
esac

echo ""
echo "  → Configuring shell ($(basename "$PROFILE")) ..."

# Claude Code: ANTHROPIC_BASE_URL
ANTHROPIC_LINE="export ANTHROPIC_BASE_URL=http://localhost:$PORT"
if [ "$SHELL_NAME" = "fish" ]; then
  ANTHROPIC_LINE="set -gx ANTHROPIC_BASE_URL http://localhost:$PORT"
fi

if [ -f "$PROFILE" ] && grep -qF "ANTHROPIC_BASE_URL" "$PROFILE" 2>/dev/null; then
  echo "  ✓ ANTHROPIC_BASE_URL already set"
else
  echo "" >> "$PROFILE"
  echo "# Tamp proxy — Claude Code" >> "$PROFILE"
  echo "$ANTHROPIC_LINE" >> "$PROFILE"
  echo "  ✓ Added ANTHROPIC_BASE_URL (Claude Code)"
fi

# Aider / Cursor / Cline: OPENAI_API_BASE
OPENAI_LINE="export OPENAI_API_BASE=http://localhost:$PORT"
if [ "$SHELL_NAME" = "fish" ]; then
  OPENAI_LINE="set -gx OPENAI_API_BASE http://localhost:$PORT"
fi

if [ -f "$PROFILE" ] && grep -qF "OPENAI_API_BASE" "$PROFILE" 2>/dev/null; then
  echo "  ✓ OPENAI_API_BASE already set"
else
  echo "# Tamp proxy — Aider / Cursor / Cline" >> "$PROFILE"
  echo "$OPENAI_LINE" >> "$PROFILE"
  echo "  ✓ Added OPENAI_API_BASE (Aider, Cursor, Cline)"
fi

# Create convenience alias
ALIAS_LINE="alias tamp='cd $DIR && node bin/tamp.js'"
if [ "$SHELL_NAME" = "fish" ]; then
  ALIAS_LINE="alias tamp 'cd $DIR; and node bin/tamp.js'"
fi

if ! grep -qF "alias tamp" "$PROFILE" 2>/dev/null; then
  echo "$ALIAS_LINE" >> "$PROFILE"
  echo "  ✓ Added 'tamp' alias"
fi

echo ""
echo "  ┌─────────────────────────────────────────┐"
echo "  │  ✓ Done! Restart your shell, then:      │"
echo "  │                                         │"
echo "  │  tamp         # start the proxy         │"
echo "  │                                         │"
echo "  │  Then in another terminal:              │"
echo "  │  claude       # Claude Code             │"
echo "  │  aider        # Aider                   │"
echo "  │  cursor       # Cursor (set base URL)   │"
echo "  └─────────────────────────────────────────┘"
echo ""
