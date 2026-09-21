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
its exact cwd, with its env entries applied as overrides. Do not narrow agents,
drop `CODEX_HOME`, or reconstruct the command. Failed inspection,
uninspectable scopes, and null repairs stop integration changes.

## Update and check

For explicit `$clooks:setup update`, resolve and verify the current binary
before downloading. If resolution fails, or `init --help` lacks `--check`,
run the binary update substep, resolve and verify again, and require inspection
support before integration maintenance.
Run the binary update substep at most once per request; if it already ran, the
binary-update intent is satisfied.

Fresh inspection selects a current project needing a binary update or safe
integration repair by default. An explicit project path takes precedence;
inspect there and warn instead of initializing an absent or ambiguous project.

- Integration-only with a compatible binary: skip download and run the exact
  repair.
- Binary-only or both: run the binary update substep, re-inspect, then run only
  a fresh safe repair still required by the selected scope.
- Explicit binary/latest request: update the binary even when integration is
  compatible, then re-inspect.
- Only global integration is stale: if global was not already explicitly
  selected, ask one scope question. If declined, report its exact repair and
  stop without changes. Refresh only after global/all-scope confirmation; `all`
  means all installation scopes, not `--agent all`.
- Otherwise, with no actionable stale project, retain the normal binary-update
  intent.

After every binary update, re-run the capability probe and inspection. Stop if
the selected scope still needs a binary update or becomes uncertain. After an
integration repair, run the same read-only inspection again and report any
remaining problem. Report other stale global scopes without changing them. No
current project means no project init. Never add agents, initialize another
scope, or commit changes.

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
