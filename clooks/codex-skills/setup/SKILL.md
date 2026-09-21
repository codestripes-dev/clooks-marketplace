---
name: setup
description: Install, update, or check Clooks and set up hooks for Codex.
---

# Clooks Setup for Codex

Run only after explicit user invocation of `$clooks:setup`. A startup reminder,
plugin installation, or project task is not setup authorization. Default to
install when no action is supplied; support install, update, and check.

After `init` or a binary update, tell the user to restart the agent to load the
Clooks MCP server.

## Locate the installer

From the actual directory of this loaded `SKILL.md`, resolve
`../../skills/setup/scripts/install.sh` inside the same cached plugin. Use that
absolute path when invoking the script. Do not assume a source checkout, search
the working project, or download a replacement script. Quote all paths. Each
command below is a separate tool call; substitute the actual absolute path for
the illustrative path rather than relying on shell variables across tool calls.

## Install and initialize

Run the installer with the install action and inspect its exit status:

```bash
bash "/actual/cached/plugin/skills/setup/scripts/install.sh" install
```

Stop on failure. In a separate call, resolve the selected executable:

```bash
bash "/actual/cached/plugin/skills/setup/scripts/install.sh" resolve
```

Stop on nonzero exit. Read the exact executable path from stdout; stderr may
contain PATH warnings and is not part of the path. Use that quoted absolute path
for subsequent version checks and init, even if it is not `~/.local/bin/clooks`.
Do not use command substitution, shell assignments or `|| exit` wrappers. Inspect
each tool result and stop on failure. Do not replace a reused binary merely
because a newer release exists; update is an explicit action.

If an existing binary was reused, show its version and ask whether to keep or
update it. If the user chooses update, run only the binary update substep below,
resolve and verify again, then return here and continue to init. Do not enter the
generic update flow. An explicit update request needs no second confirmation.

In the user's intended project, run:

```bash
"/actual/path/from/resolve/clooks" init --agent codex
```

If launched from HOME or outside the intended project, ask for the project or
leave init for later. Never infer global setup from launching in HOME. Init
registers runtime hooks and the Clooks MCP server used for approvals; do not
write registrations directly.

Only for explicitly requested user-wide setup, run:

```bash
"/actual/path/from/resolve/clooks" init --global --agent codex
```

Only for explicitly requested Claude Code and Codex setup, replace `--agent codex`
with `--agent all` for the requested scope. Both agents does not mean global.

Report the actual binary path/version and which init operations succeeded.
Distinguish installation from PATH readiness and native trust/review. Absolute-path
init can succeed while generated hooks cannot find `clooks` on the agent's PATH.
A child-shell export or profile edit does not repair the running agent environment;
explain when relaunching with corrected PATH is necessary. Never claim native
hooks are active solely because init succeeded.

## Binary update substep

Run the same absolute installer path with action `update` in a standalone call.
Stop on failure. If it refuses an external or shadowed binary, direct the user
to its original installation method; do not change PATH or silently switch
binaries. Then run `resolve` and the resolved executable's `--version` in
separate calls.

## Inspection for update and check

After resolving and verifying the selected executable, run its `init --help`
and check for `--check`. When supported, inspect from the intended project:

```bash
"/actual/path/from/resolve/clooks" init --check --json
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

## Update and check

For explicit `$clooks:setup update`, resolve and verify the current binary
before downloading. If resolution fails, or `init --help` lacks `--check`,
run the binary update substep, resolve and verify again, and require inspection
support before integration maintenance.
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

For check, invoke the installer with action `check` in a standalone call. If it
succeeds, resolve and verify the binary, probe `init --help`, and run the
read-only inspection when supported. Report binary/PATH health separately from
scope state. If inspection is unsupported, report that an explicit binary update
is required; do not update. Check authorizes no download, init, profile edit, or
native trust change.

## Hook packs

Hook packs are optional. Setup does not authorize installing them automatically.
Only when the user requests a pack, run its separate native install command:

```bash
codex plugin add clooks-core-hooks@clooks-marketplace
codex plugin add clooks-project-hooks@clooks-marketplace
codex plugin add clooks-example-hooks@clooks-marketplace
```

Install only the requested packs. With an initialized runtime, the next valid
Codex hook event discovers enabled packs and vendors their hooks. Review the
resulting Clooks configuration; opt-in hooks stay disabled. Native installation
writes user activation by default, not project activation based on the pack name.
Existing vendor copies are preserved until you run
`clooks update plugin:<pack-name>` after refreshing the native plugin cache.
Do not suggest nested marketplace pack URLs work with `clooks add`.
