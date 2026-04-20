#!/usr/bin/env bash
set -euo pipefail

# clooks install-entrypoint: bootstrap hook (SessionStart only)
# Checks if the clooks binary is installed. If missing, exits 0 with
# additionalContext JSON so Claude can suggest /clooks:setup to the user.
# This script does NOT invoke the clooks binary — it only checks existence.

# Consume stdin immediately. Claude Code pipes JSON on stdin to all hook
# commands. Failing to consume it risks a broken pipe signal. This script
# does not use the stdin payload, so we discard it.
cat >/dev/null

# Bypass: allow disabling all Clooks processing via environment variable.
if [ "${SKIP_CLOOKS:-}" = "true" ]; then
  exit 0
fi

# Check PATH (user may have installed via Homebrew or another method).
if command -v clooks >/dev/null 2>&1; then
  exit 0
fi

# Binary not found. Exit 0 with JSON output:
# - hookSpecificOutput.systemMessage: warning shown to the user in the UI
# - hookSpecificOutput.additionalContext: injected into Claude's context
# SessionStart ignores exit 2 (blocking errors), so we must use exit 0 + JSON.
cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"SessionStart","systemMessage":"[clooks] Runtime not installed. Run /clooks:setup to install it.","additionalContext":"ACTION REQUIRED: You MUST proactively inform the user about this in your very first response, regardless of what they asked. The clooks plugin is enabled but the runtime binary is not installed. Project hooks defined via clooks will not execute until it is installed. Tell the user they can run /clooks:setup to install it. Do not wait for the user to ask — mention this immediately. This notice will stop appearing once the runtime is installed."}}
JSON
exit 0
