#!/usr/bin/env bash
set -euo pipefail

# clooks install-entrypoint: bootstrap hook (SessionStart only)
# Checks executable availability without invoking the binary or setup.

# Consume stdin immediately. Agents pipe JSON on stdin to hook
# commands. Failing to consume it risks a broken pipe signal. This script
# does not use the stdin payload, so we discard it.
cat >/dev/null

# Bypass: allow disabling all Clooks processing via environment variable.
if [ "${SKIP_CLOOKS:-}" = "true" ]; then
  exit 0
fi

# Check PATH (user may have installed via Homebrew or another method).
binary="$(command -v clooks || true)"
if [ -n "$binary" ] && [ -f "$binary" ] && [ -x "$binary" ]; then
  exit 0
fi

# Only fixed strings enter JSON; never interpolate paths or agent input.
setup='/clooks:setup'
if [ "${CLOOKS_AGENT:-}" = "codex" ]; then
  setup='$clooks:setup'
fi

if [ -n "${HOME:-}" ] && [ -f "$HOME/.local/bin/clooks" ] && [ -x "$HOME/.local/bin/clooks" ]; then
  message="[clooks] Clooks is installed at ~/.local/bin/clooks but unavailable on this agent's PATH. Run $setup check for details. Add ~/.local/bin to PATH and relaunch the agent if needed."
  context="A managed runtime exists, but this agent cannot find it on PATH. Tell the user about $setup check and the PATH correction. Editing shell rc or exporting PATH in a child setup shell does not repair the running agent's environment."
else
  message="[clooks] No executable runtime found on PATH or at ~/.local/bin/clooks. Run $setup to set up Clooks."
  context="Tell the user that no executable Clooks runtime was found and that they can explicitly invoke $setup to set it up."
fi

cat <<JSON
{"systemMessage":"$message","hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"$context This is a reminder only: do not run setup, install, update, initialize, or request startup consent automatically. Wait for the user to explicitly invoke setup."}}
JSON
exit 0
