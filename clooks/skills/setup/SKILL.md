---
name: clooks:setup
description: Install or update the Clooks runtime binary and initialize the project. Run this after installing the clooks plugin to set up the hook runtime.
disable-model-invocation: true
argument-hint: "[install|update|check]"
---

# Clooks Runtime Setup

You are helping the user install, update, or check the Clooks runtime binary.

## Determine the action

Based on $ARGUMENTS:
- If empty or "install": run the install flow
- If "update": run the update flow
- If "check": run the health check flow

## Install flow

Step 1: Run the bundled install script:

```bash
bash "${CLAUDE_SKILL_DIR}/scripts/install.sh" install
```

If the script exits non-zero, show the error output and help the user troubleshoot.
Common issues:
- Network error: check internet connection
- Permission denied: the script installs to ~/.local/bin/ which should be user-writable
- Unsupported platform: only macOS (arm64, x64) and Linux (x64, arm64) are supported
- Checksum mismatch: prints expected and actual hashes — could indicate a corrupted download or man-in-the-middle

Step 2: Check whether the user is in a project directory (not their home
directory). A project directory typically contains a `.git/` directory or
other project markers.

If they ARE in a project directory, initialize it:

```bash
"$HOME/.local/bin/clooks" init
```

This creates the .clooks/ directory (if absent), writes a starter clooks.yml
(if absent), and registers the project entrypoint in .claude/settings.json for
all hook events. From this point on, the project entrypoint handles all event
dispatching — the plugin's SessionStart hook becomes a silent no-op.

If they are NOT in a project directory (e.g., they launched Claude from ~),
skip this step. Tell them they can run `clooks init` later from inside any
project to enable hooks for that project.

Step 3: Ask the user if they also want to set up user-wide hooks. Explain:

> Would you also like to set up user-wide hooks? This lets you define
> custom hooks that apply across ALL your Claude Code sessions —
> regardless of which project you're in. You can scope hooks user-wide,
> project-wide, and locally, all independently.

If they say yes, also execute:

```bash
"$HOME/.local/bin/clooks" init --global
```

This creates ~/.clooks/clooks.yml (for user-wide hook config) and registers
a global entrypoint in ~/.claude/settings.json. User-wide hooks run for
every project. Project-level hooks (from `clooks init` inside a project)
layer on top and can override them.

If they say no, skip this step.

Step 4: Confirm success. Tell the user:
- The clooks binary is installed at ~/.local/bin/clooks
- If project init ran: the project is initialized with .clooks/clooks.yml
- If global init ran: user-wide hooks are set up at ~/.clooks/clooks.yml
- They can install hook packs (e.g., /plugin install clooks-example-hooks@clooks-marketplace)
- They can write custom hooks in .clooks/hooks/ (project) or ~/.clooks/hooks/ (user-wide)

## Update flow

Run the bundled install script with the update action:

```bash
bash "${CLAUDE_SKILL_DIR}/scripts/install.sh" update
```

Report what version was installed and what version it was updated to.

## Health check flow

Run the bundled install script with the check action:

```bash
bash "${CLAUDE_SKILL_DIR}/scripts/install.sh" check
```

Report the results: binary location, version, whether .clooks/ exists, config status.
