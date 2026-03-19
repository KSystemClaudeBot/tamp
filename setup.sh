#!/usr/bin/env bash
set -euo pipefail

# Tamp — Token Compression Proxy for Coding Agents
# curl -fsSL https://tamp.dev/setup.sh | bash

REPO="https://github.com/sliday/tamp.git"
DIR="${TAMP_DIR:-$HOME/.tamp}"
PORT="${TAMP_PORT:-7778}"

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'
BLUE='\033[0;34m'; MAGENTA='\033[0;35m'; CYAN='\033[0;36m'
BOLD='\033[1m'; DIM='\033[2m'; RESET='\033[0m'

ok()   { echo -e "  ${GREEN}✓${RESET} $1"; }
warn() { echo -e "  ${YELLOW}→${RESET} $1"; }
fail() { echo -e "  ${RED}✗${RESET} $1"; }
step() { echo -e "\n  ${CYAN}${BOLD}$1${RESET}"; }

echo ""
echo -e "  ${CYAN}${BOLD}┌─────────────────────────────────┐${RESET}"
echo -e "  ${CYAN}│${RESET}       ${BOLD}  Tamp Setup  ${RESET}           ${CYAN}│${RESET}"
echo -e "  ${CYAN}│${RESET}  ${DIM}Token compression for agents${RESET}   ${CYAN}│${RESET}"
echo -e "  ${CYAN}${BOLD}└─────────────────────────────────┘${RESET}"

# Check deps
step "Checking dependencies"
command -v node >/dev/null 2>&1 || { fail "node is required. Install from https://nodejs.org"; exit 1; }
command -v git >/dev/null 2>&1 || { fail "git is required."; exit 1; }
ok "node $(node --version)"
ok "git found"

# Clone or update
step "Installing Tamp"
if [ -d "$DIR" ]; then
  warn "Updating existing install in ${DIM}$DIR${RESET}"
  cd "$DIR" && git pull --quiet
  ok "Updated to latest"
else
  warn "Cloning to ${DIM}$DIR${RESET}"
  git clone --quiet --depth 1 "$REPO" "$DIR"
  ok "Cloned"
fi

cd "$DIR"

# Install Node deps
step "Node dependencies"
SPINNER="⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"
npm install --silent 2>/dev/null &
NPM_PID=$!
i=0
while kill -0 $NPM_PID 2>/dev/null; do
  printf "\r  ${YELLOW}%s${RESET} Installing ..." "${SPINNER:$((i % ${#SPINNER})):1}"
  i=$((i + 1))
  sleep 0.1
done
wait $NPM_PID
printf "\r  ${GREEN}✓${RESET} Dependencies installed       \n"

# --- LLMLingua-2 sidecar setup ---
step "LLMLingua-2 Neural Compression"
STAGES="minify,toon"
HAS_LLMLINGUA=false

if command -v python3 >/dev/null 2>&1; then
  ok "python3 $(python3 --version 2>&1 | awk '{print $2}')"

  SIDECAR_DIR="$DIR/sidecar"
  VENV_DIR="$SIDECAR_DIR/.venv"
  REQ_FILE="$SIDECAR_DIR/requirements.txt"

  if [ -f "$REQ_FILE" ]; then
    if [ -d "$VENV_DIR" ] && "$VENV_DIR/bin/python" -c "from llmlingua import PromptCompressor" 2>/dev/null; then
      ok "LLMLingua-2 already installed"
      HAS_LLMLINGUA=true
    else
      echo ""
      echo -e "  ${MAGENTA}${BOLD}LLMLingua-2${RESET} compresses source code, markdown, and"
      echo -e "  logs using a neural model — ${GREEN}up to 50% extra savings${RESET}."
      echo -e "  Runs ${BOLD}locally${RESET} as a Python sidecar, auto-starts with tamp."
      echo ""

      INSTALL_LLMLINGUA=y
      if [ -t 0 ]; then
        printf "  Install LLMLingua-2? ${DIM}(~500MB, recommended)${RESET} [${GREEN}Y${RESET}/n] "
        read -r INSTALL_LLMLINGUA
        INSTALL_LLMLINGUA="${INSTALL_LLMLINGUA:-y}"
      fi

      if [ "$INSTALL_LLMLINGUA" = "y" ] || [ "$INSTALL_LLMLINGUA" = "Y" ]; then
        warn "Creating Python virtual environment"
        python3 -m venv "$VENV_DIR"
        ok "Virtual environment created"

        echo ""
        "$VENV_DIR/bin/pip" install -r "$REQ_FILE" --quiet 2>/dev/null &
        PIP_PID=$!
        i=0
        while kill -0 $PIP_PID 2>/dev/null; do
          printf "\r  ${YELLOW}%s${RESET} Installing LLMLingua-2 ${DIM}(1-2 min)${RESET} ..." "${SPINNER:$((i % ${#SPINNER})):1}"
          i=$((i + 1))
          sleep 0.1
        done
        if wait $PIP_PID; then
          printf "\r  ${GREEN}✓${RESET} LLMLingua-2 installed                           \n"
          HAS_LLMLINGUA=true
        else
          printf "\r  ${RED}✗${RESET} LLMLingua-2 install failed                      \n"
          warn "Continuing without LLMLingua-2"
        fi
      fi
    fi
  fi
else
  warn "python3 not found — LLMLingua-2 unavailable"
  echo -e "    ${DIM}Install Python 3 to enable neural compression${RESET}"
fi

if [ "$HAS_LLMLINGUA" = true ]; then
  STAGES="minify,toon,llmlingua"
fi

# Summary
step "Compression pipeline"
echo -e "    ${GREEN}▸${RESET} ${CYAN}minify${RESET}    — JSON whitespace removal"
echo -e "    ${GREEN}▸${RESET} ${CYAN}toon${RESET}      — TOON columnar encoding"
if [ "$HAS_LLMLINGUA" = true ]; then
  echo -e "    ${GREEN}▸${RESET} ${MAGENTA}llmlingua${RESET} — neural text compression ${GREEN}(auto-starts)${RESET}"
else
  echo -e "    ${DIM}○ llmlingua — not installed${RESET}"
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

step "Shell configuration ($(basename "$PROFILE"))"

# Claude Code: ANTHROPIC_BASE_URL
ANTHROPIC_LINE="export ANTHROPIC_BASE_URL=http://localhost:$PORT"
[ "$SHELL_NAME" = "fish" ] && ANTHROPIC_LINE="set -gx ANTHROPIC_BASE_URL http://localhost:$PORT"

if [ -f "$PROFILE" ] && grep -qF "ANTHROPIC_BASE_URL" "$PROFILE" 2>/dev/null; then
  ok "ANTHROPIC_BASE_URL already set"
else
  echo "" >> "$PROFILE"
  echo "# Tamp proxy — Claude Code" >> "$PROFILE"
  echo "$ANTHROPIC_LINE" >> "$PROFILE"
  ok "Added ANTHROPIC_BASE_URL ${DIM}(Claude Code)${RESET}"
fi

# Aider / Cursor / Cline: OPENAI_API_BASE
OPENAI_LINE="export OPENAI_API_BASE=http://localhost:$PORT"
[ "$SHELL_NAME" = "fish" ] && OPENAI_LINE="set -gx OPENAI_API_BASE http://localhost:$PORT"

if [ -f "$PROFILE" ] && grep -qF "OPENAI_API_BASE" "$PROFILE" 2>/dev/null; then
  ok "OPENAI_API_BASE already set"
else
  echo "# Tamp proxy — Aider / Cursor / Cline" >> "$PROFILE"
  echo "$OPENAI_LINE" >> "$PROFILE"
  ok "Added OPENAI_API_BASE ${DIM}(Aider, Cursor, Cline)${RESET}"
fi

# Set TAMP_STAGES
STAGES_LINE="export TAMP_STAGES=$STAGES"
[ "$SHELL_NAME" = "fish" ] && STAGES_LINE="set -gx TAMP_STAGES $STAGES"

if [ -f "$PROFILE" ] && grep -qF "TAMP_STAGES" "$PROFILE" 2>/dev/null; then
  sed -i.bak "s|export TAMP_STAGES=.*|export TAMP_STAGES=$STAGES|" "$PROFILE" 2>/dev/null || true
  rm -f "$PROFILE.bak"
  ok "Updated TAMP_STAGES=${BOLD}$STAGES${RESET}"
else
  echo "$STAGES_LINE" >> "$PROFILE"
  ok "Added TAMP_STAGES=${BOLD}$STAGES${RESET}"
fi

# Create/update tamp alias
ALIAS_LINE="alias tamp='cd $DIR && node bin/tamp.js'"
[ "$SHELL_NAME" = "fish" ] && ALIAS_LINE="alias tamp 'cd $DIR; and node bin/tamp.js'"

if grep -qF "alias tamp" "$PROFILE" 2>/dev/null; then
  sed -i.bak "s|alias tamp=.*|alias tamp='cd $DIR \&\& node bin/tamp.js'|" "$PROFILE" 2>/dev/null || true
  rm -f "$PROFILE.bak"
  ok "Updated ${BOLD}tamp${RESET} alias"
else
  echo "$ALIAS_LINE" >> "$PROFILE"
  ok "Added ${BOLD}tamp${RESET} alias"
fi

echo ""
echo -e "  ${GREEN}${BOLD}┌─────────────────────────────────────────────────┐${RESET}"
echo -e "  ${GREEN}${BOLD}│${RESET}  ${GREEN}✓ All done!${RESET} Restart your shell, then:          ${GREEN}${BOLD}│${RESET}"
echo -e "  ${GREEN}${BOLD}│${RESET}                                                 ${GREEN}${BOLD}│${RESET}"
echo -e "  ${GREEN}${BOLD}│${RESET}  ${CYAN}${BOLD}tamp${RESET}         ${DIM}# starts proxy + LLMLingua-2${RESET}      ${GREEN}${BOLD}│${RESET}"
echo -e "  ${GREEN}${BOLD}│${RESET}                                                 ${GREEN}${BOLD}│${RESET}"
echo -e "  ${GREEN}${BOLD}│${RESET}  Then in another terminal:                      ${GREEN}${BOLD}│${RESET}"
echo -e "  ${GREEN}${BOLD}│${RESET}  ${YELLOW}claude${RESET}       ${DIM}# Claude Code${RESET}                     ${GREEN}${BOLD}│${RESET}"
echo -e "  ${GREEN}${BOLD}│${RESET}  ${YELLOW}aider${RESET}        ${DIM}# Aider${RESET}                           ${GREEN}${BOLD}│${RESET}"
echo -e "  ${GREEN}${BOLD}│${RESET}  ${YELLOW}cursor${RESET}       ${DIM}# set base URL in prefs${RESET}           ${GREEN}${BOLD}│${RESET}"
echo -e "  ${GREEN}${BOLD}└─────────────────────────────────────────────────┘${RESET}"
echo ""
