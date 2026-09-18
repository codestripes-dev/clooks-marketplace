---
name: clooks:setup
description: Install or update the Clooks runtime binary and initialize the project. Run this after installing the clooks plugin to set up the hook runtime.
disable-model-invocation: true
argument-hint: "[install|update|check]"
---

# Clooks Runtime Setup

You are helping the user install, update, or check the Clooks runtime binary.
Run this skill only when the user explicitly invokes it. Plugin installation and
startup reminders do not authorize install, update, or init.

## Determine the action

Based on $ARGUMENTS:
- If empty or "install": run the install flow
- If "update": run the update flow
- If "check": run the health check flow

After `init` or a binary update, tell the user to restart the agent to load the
Clooks MCP server.

## Install flow

Step 1: Run the bundled install script:

```bash
bash "${CLAUDE_SKILL_DIR}/scripts/install.sh" install
```

If the script exits non-zero, show the error output and help the user troubleshoot.
Stop the flow on failure; do not initialize or report success. Install reuses an
executable PATH binary first, then an executable managed binary, without downloads
or shell profile changes. A broken binary or requested-version mismatch requires
repair or an explicit update, not an automatic replacement.
Common issues:
- Network error: check internet connection
- Permission denied: the script installs to ~/.local/bin/ which should be user-writable
- Unsupported platform: only macOS (arm64, x64) and Linux (x64, arm64) are supported
- Checksum mismatch: prints expected and actual hashes — could indicate a corrupted download or man-in-the-middle

Resolve the selected executable with a standalone tool command (resolve validates
the version and writes only the path to stdout):

```bash
bash "${CLAUDE_SKILL_DIR}/scripts/install.sh" resolve
```

Stop if that tool call fails. Record its stdout path in your working context, then
invoke that exact quoted absolute path with `--version` in a separate tool call.
Stop on a nonzero result. Do not use shell assignments, command substitution,
compound commands, or assume variables persist between tool calls. In subsequent
examples, replace `/resolved/absolute/path/clooks` with the actual returned path;
never execute the placeholder or substitute a hardcoded managed location.

If an existing binary was reused, show its version and ask whether to keep it or
update it before continuing setup. If the user chooses update, follow the update
flow below, then resolve and verify the executable again before proceeding to
Step 2. If they keep it, continue with that binary. An explicit `update` request
already authorizes the update; do not ask again.

Step 2: Check whether the user is in a project directory (not their home
directory). A project directory typically contains a `.git/` directory or
other project markers.

If they ARE in a project directory, initialize it:

```bash
"/resolved/absolute/path/clooks" init
```

This creates the .clooks/ directory (if absent), writes a starter clooks.yml
(if absent), and registers the project entrypoint in .claude/settings.json for
supported Claude hook events and the Clooks MCP server used for approvals.
Successful init establishes registration, not native activation or PATH
readiness. Report init errors and stop rather than continuing to a success
message.

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
"/resolved/absolute/path/clooks" init --global
```

Check this tool result and stop on failure. This creates ~/.clooks/clooks.yml (for user-wide hook config) and registers
a global entrypoint in ~/.claude/settings.json. User-wide hooks run for
every project. Project-level hooks (from `clooks init` inside a project)
layer on top and can override them.

If they say no, skip this step.

Step 4: Report only the steps that succeeded. Tell the user:
- The actual resolved binary location and reported version, and whether it was reused or installed
- If project init ran: the project is initialized with .clooks/clooks.yml
- If global init ran: user-wide hooks are set up at ~/.clooks/clooks.yml
- They can install hook packs:
  - `/plugin install clooks-core-hooks@clooks-marketplace` — user-wide / project-wide useful hooks for any situation
  - `/plugin install clooks-project-hooks@clooks-marketplace` — project-specific hooks
- Or, if they have a specific behavior in mind, they can author one from scratch with `/clooks:create-hook` (scaffolds into `.clooks/hooks/` for project scope, or `~/.clooks/hooks/` for user-wide).

Mention the hook packs first — most users want batteries-included. Suggest `/clooks:create-hook` as the alternative for users who already know what they want to build.

If the binary is managed-only and absent from the agent's PATH, say that explicitly.
Init can succeed through an absolute path while runtime hooks still cannot find
`clooks`. Editing a shell profile or exporting PATH inside a child setup shell
does not repair the running agent's environment. Explain how to add the selected
binary's directory to the agent launch PATH and relaunch if needed. Do not claim
hooks are ready merely because install or init succeeded, or infer the agent's
PATH from a child shell where you changed it.

## Update flow

Users can request this directly with `/clooks:setup update`.

Run the bundled install script with the update action:

```bash
bash "${CLAUDE_SKILL_DIR}/scripts/install.sh" update
```

Update is explicit and only replaces the managed binary after checksum and version
validation. If PATH selects an external installation, the installer refuses to
overwrite it or create a shadow copy; direct the user to that installation method.
Do not work around this by changing PATH to hide the external binary.

Report the actual output and resulting version. Stop on failure. Do not claim a
previous version unless it was successfully observed, and do not run init as an
implicit part of update.

## Health check flow

Run the bundled install script with the check action:

```bash
bash "${CLAUDE_SKILL_DIR}/scripts/install.sh" check
```

Report the exit status, selected binary location and version, project config-file
presence, and any PATH warning. Missing or broken binaries fail the check. File
presence alone is not config validation, hook activation, or runtime readiness.
