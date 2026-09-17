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

## Update and check

For explicit update, invoke the same absolute installer path with action `update`
in a standalone tool call. Stop on failure and follow
its diagnostics for externally managed or shadowed binaries; do not overwrite
package-manager paths or silently switch binaries. Resolve and report the binary
selected afterward. Do not initialize more projects or scopes as part of update.

For check, invoke that installer with action `check` in a standalone tool call.
Report installation, PATH and project
setup separately. Check does not authorize installation, update, init, profile
edits, or native trust changes.

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
