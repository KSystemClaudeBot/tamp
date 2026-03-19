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

# --- LLMLingua-2 setup ---
echo ""
echo "  ┌─ Compression Stages ─────────────────────┐"
echo "  │                                           │"
echo "  │  minify  — strip JSON whitespace (fast)   │"
echo "  │  toon    — columnar encoding (fast)       │"
echo "  │  llmlingua — neural text compression      │"
echo "  │              (requires Python sidecar)     │"
echo "  │                                           │"
echo "  └───────────────────────────────────────────┘"
echo ""

STAGES="minify,toon"

# Check if we can prompt interactively
if [ -t 0 ]; then
  printf "  Enable LLMLingua-2 neural compression? [y/N] "
  read -r LLMLINGUA_ANSWER
  if [ "${LLMLINGUA_ANSWER:-n}" = "y" ] || [ "${LLMLINGUA_ANSWER:-n}" = "Y" ]; then
    STAGES="minify,toon,llmlingua"
    LLMLINGUA_PORT=8788

    echo ""
    echo "  → Setting up LLMLingua-2 sidecar ..."

    if command -v python3 >/dev/null 2>&1; then
      echo "  ✓ python3 found"

      SIDECAR_DIR="$DIR/sidecar"
      if [ ! -d "$SIDECAR_DIR/venv" ]; then
        echo "  → Creating Python virtual environment ..."
        python3 -m venv "$SIDECAR_DIR/venv"
        echo "  ✓ Virtual environment created"

        echo "  → Installing LLMLingua-2 (this takes a while) ..."
        "$SIDECAR_DIR/venv/bin/pip" install llmlingua flask --quiet 2>/dev/null &
        PIP_PID=$!
        i=0
        while kill -0 $PIP_PID 2>/dev/null; do
          printf "\r  %s Installing LLMLingua-2 ..." "${SPINNER:$((i % ${#SPINNER})):1}"
          i=$((i + 1))
          sleep 0.1
        done
        if wait $PIP_PID; then
          printf "\r  ✓ LLMLingua-2 installed          \n"
        else
          printf "\r  ✗ LLMLingua-2 install failed      \n"
          echo "  → Falling back to minify,toon only"
          STAGES="minify,toon"
        fi
      else
        echo "  ✓ LLMLingua-2 already installed"
      fi
    else
      echo "  ✗ python3 not found — skipping LLMLingua-2"
      echo "  → Using minify,toon only"
      STAGES="minify,toon"
    fi
  fi
else
  echo "  → Non-interactive install: using minify,toon"
  echo "  → To enable LLMLingua-2 later, set TAMP_STAGES=minify,toon,llmlingua"
fi

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

# Set TAMP_STAGES
STAGES_LINE="export TAMP_STAGES=$STAGES"
if [ "$SHELL_NAME" = "fish" ]; then
  STAGES_LINE="set -gx TAMP_STAGES $STAGES"
fi

if [ -f "$PROFILE" ] && grep -qF "TAMP_STAGES" "$PROFILE" 2>/dev/null; then
  # Update existing stages line
  sed -i.bak "s|export TAMP_STAGES=.*|export TAMP_STAGES=$STAGES|" "$PROFILE" 2>/dev/null || true
  rm -f "$PROFILE.bak"
  echo "  ✓ Updated TAMP_STAGES=$STAGES"
else
  echo "$STAGES_LINE" >> "$PROFILE"
  echo "  ✓ Added TAMP_STAGES=$STAGES"
fi

# Set LLMLingua URL if enabled
if echo "$STAGES" | grep -q "llmlingua"; then
  LINGUA_LINE="export TAMP_LLMLINGUA_URL=http://localhost:${LLMLINGUA_PORT:-8788}"
  if [ "$SHELL_NAME" = "fish" ]; then
    LINGUA_LINE="set -gx TAMP_LLMLINGUA_URL http://localhost:${LLMLINGUA_PORT:-8788}"
  fi
  if [ -f "$PROFILE" ] && grep -qF "TAMP_LLMLINGUA_URL" "$PROFILE" 2>/dev/null; then
    echo "  ✓ TAMP_LLMLINGUA_URL already set"
  else
    echo "$LINGUA_LINE" >> "$PROFILE"
    echo "  ✓ Added TAMP_LLMLINGUA_URL"
  fi
fi

# Create/update tamp alias
ALIAS_LINE="alias tamp='cd $DIR && node bin/tamp.js'"
if [ "$SHELL_NAME" = "fish" ]; then
  ALIAS_LINE="alias tamp 'cd $DIR; and node bin/tamp.js'"
fi

if grep -qF "alias tamp" "$PROFILE" 2>/dev/null; then
  # Update existing alias (might be old node index.js version)
  sed -i.bak "s|alias tamp=.*|alias tamp='cd $DIR \&\& node bin/tamp.js'|" "$PROFILE" 2>/dev/null || true
  rm -f "$PROFILE.bak"
  echo "  ✓ Updated 'tamp' alias"
else
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
if echo "$STAGES" | grep -q "llmlingua"; then
echo ""
echo "  Note: Start the LLMLingua sidecar before tamp:"
echo "    $DIR/sidecar/venv/bin/python -m llmlingua.server --port ${LLMLINGUA_PORT:-8788}"
fi
echo ""
