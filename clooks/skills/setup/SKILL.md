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
update it before continuing. If the user chooses update, run only the binary
update substep below, resolve and verify again, then return here and continue to
Step 2. Do not enter the generic update flow. An explicit `update` request
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

## Binary update substep

Run:

```bash
bash "${CLAUDE_SKILL_DIR}/scripts/install.sh" update
```

Stop on failure. If the installer refuses an external or shadowed binary, direct
the user to its original installation method; do not hide it by changing PATH.
Then run `resolve` and the resolved executable's `--version` in separate calls.

## Inspection for update and check

After resolving and verifying the selected executable, run its `init --help`
and check for `--check`. When supported, inspect from the intended project:

```bash
"/resolved/absolute/path/clooks" init --check --json
```

Use `init --check --global --json` only for an explicitly selected global-only
operation. Require one successful JSON envelope and inspect `data.scopes`;
`ok: true` alone is not a healthy result.

A scope is repairable only when `needsIntegrationRefresh` is true and `repair`
is non-null. Execute the selected repair with its exact executable and args, in
its exact cwd, with its env entries applied as overrides; empty env inherits the
environment. Use tool workdir/env or a one-call cd/env prefix, not persistent
shell assignments. Do not narrow agents, drop `CODEX_HOME`, or reconstruct the
command. A null repair means do not repair that scope: skip current/absent scopes.
Failed inspection or an ambiguous/uninspectable selected scope requires reporting
the problem and stopping changes.

## Update flow

Users can request this directly with `/clooks:setup update`.

Resolve and verify the current binary before downloading. If resolution fails,
or `init --help` lacks `--check`, run the binary update substep, resolve and
verify again, and require inspection support before integration maintenance.
Run the binary update substep at most once per request; if it already ran, the
binary-update intent is satisfied.

Fresh inspection selects both existing current-project and global installations
for a generic update, with no extra confirmation for existing global scope.
Explicit project-only or global-only requests limit repairs to that scope;
explicit binary-only requests never run init. An explicit project path limits
integration repair to that project; inspect there and verify the reported root
matches the intended root before repair. Warn instead of initializing an absent
or ambiguous project. Never initialize absent scopes or add agents.

- Integration-only with a compatible binary: skip download and refresh every
  selected scope needing a safe exact repair, preserving its existing agents.
- Any selected scope requires a binary update: run the binary update substep,
  then re-inspect before any integration repair.
- Explicit binary/latest request: update the binary even when integration is
  compatible, then re-inspect; binary-only still prohibits init.
- With no actionable maintenance in the selected scopes, retain the normal
  binary-update intent.

After every binary update, re-run the capability probe and inspection. Stop if
a selected scope still needs a binary update. Failed or malformed inspection,
or uninspectable/uncertain selected scopes, stop changes; do not guess repairs.
Repair selected scopes in `data.scopes` order (global then project). Before each
repair, inspect again and use only the fresh envelope's exact executable/args/cwd/env,
including CODEX_HOME, for a selected scope still needing a safe repair.
Stop on repair failure. Re-inspect afterward and report completed
changes and all remaining problems, including scopes excluded by an explicit
limit. Never commit changes.

## Health check flow

Run:

```bash
bash "${CLAUDE_SKILL_DIR}/scripts/install.sh" check
```

If it succeeds, resolve and verify the binary, probe `init --help`, and run the
read-only inspection when supported. Report binary/PATH health separately from
scope state. If inspection is unsupported, report that an explicit binary update
is required; do not update. Check authorizes no download, init, profile edit, or
trust change.
