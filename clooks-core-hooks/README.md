# clooks-core-hooks

Curated zero-config production hooks for [clooks](https://clooks.cc): command safety, git protection, tool hygiene, and tmux notifications. Every hook in this pack works out of the box with no per-project setup.

For hooks that encode project-specific decisions (allowed package managers, protected paths, script wrappers), see [clooks-project-hooks](../clooks-project-hooks/).

## Hooks

### no-compound-commands

Blocks compound bash commands (`&&`, `||`, `;`) to encourage single-purpose Bash calls and use of built-in Claude tools.

**When to enable:** Always. Prevents Claude from chaining fragile multi-step commands that are hard to debug and audit.

**Config options:** None.

**Escape hatch:** Prefix a command with `ALLOW_COMPOUND=true` to bypass the check. The hook also allows `cd <path> && <command>` as a safe pattern (single-command remainder only).

---

### no-bare-mv

Rewrites bare `mv` to `git mv` when `git mv` would succeed, preserving git history for renamed/moved files.

**When to enable:** In any git-tracked project where you want file moves to preserve history by default.

**Config options:** None.

**Escape hatch:** None needed. The hook runs a dry-run (`git mv -n`) and automatically falls back to allowing bare `mv` when `git mv` would fail (e.g., untracked files, cross-filesystem moves).

---

### tmux-notifications

Visual tmux indicators for Claude Code session state. Sets red window status when idle, bold red with pane flash for permission/elicitation prompts, and resets on activity (new prompt, tool use, session start).

**When to enable:** When running Claude Code inside tmux and you want visual feedback about session state across multiple windows/panes.

**Config options:** None.

**Escape hatch:** The hook no-ops automatically when the `TMUX` environment variable is not set (i.e., outside tmux). The `beforeHook` calls `event.respond({ result: "skip" })` to bail out early.

**Note:** This hook has no test file. Testing requires a real tmux environment with `TMUX_PANE` set, which cannot be simulated in unit tests.

---

### no-rm-rf

Blocks recursive `rm` (`rm -rf`, `rm -r`, `rm -R`, and flag-order variants) against catastrophic paths. Expands glob patterns via `Bun.Glob.scanSync` so every concrete target is classified, not just the literal argument string. Returns `allow` for build-artifact basenames, `ask` for within-project non-artifact deletes, and `block` for home, system directories, project-root escapes, and unresolvable patterns.

**When to enable:** Always. Catches the catastrophic-rm incidents catalogued in [docs/research/agent-rm-rf-failures.md](https://github.com/codestripes-dev/clooks/blob/master/docs/research/agent-rm-rf-failures.md) (Mike Wolak's home-directory wipe and ~10 other documented agent-caused `rm -rf` disasters from Claude Code, Cursor, Gemini CLI, Replit, Amazon Q, and Google Antigravity).

**Config options:**

Each of the 11 rule IDs can be individually disabled (default: enabled). Setting a rule to `false` in `clooks.yml` returns `skip` instead of block/ask for that rule's trigger:

- `rm-rf-no-project-root` — fail-closed when no git repo or `.clooks/clooks.yml` is reachable from cwd.
- `rm-rf-no-preserve-root` — `--no-preserve-root` present (disables GNU rm's built-in safeguard).
- `rm-rf-unresolved-var` — target contains `$VAR`, `${VAR}`, `$(cmd)`, or backticks.
- `rm-rf-globstar` — target contains `**`.
- `rm-rf-dangerous-glob-unbypassable` — literal `.*` or `/*`.
- `rm-rf-expansion-error` — `Bun.Glob` scan threw (EACCES), or a symlink was detected in the scan parent (ELOOP_GUARD).
- `rm-rf-home` — target resolves to a user home directory (`~`, `$HOME`, `/home/<user>`, `/Users/<user>`).
- `rm-rf-root` — target resolves to `/` or a system top-level (`/etc`, `/usr`, `/bin`, `/lib`, `/var`, `/tmp`, ...).
- `rm-rf-project-root` — target resolves to the project root itself.
- `rm-rf-escape` — target resolves outside the project root.
- `rm-rf-strict` — target is inside project but not in the allowlist.
- `extraAllowlist: string[]` — additional basenames (beyond the default list) that should be allowed inside the project (default: `[]`).
- `strictMode: boolean` — when `true`, promotes `rm-rf-project-root` and `rm-rf-strict` from `ask` to `block` (default: `false`).

**Escape hatch:** Prefix the command with `ALLOW_DESTRUCTIVE_RM=true` to bypass rules 1, 3, 4, 6, and 10 (fail-closed/fail-open-ish triggers). Rules 2, 5, 7, 8, 9, and 11 are **unbypassable** — no escape hatch.

**Patterns blocked (11 rules, in evaluation order):**

1. `rm-rf-no-project-root` — `rm -rf` outside any recognizable project. Flag-bypassable.
2. `rm-rf-no-preserve-root` — `--no-preserve-root` present. **Unbypassable.**
3. `rm-rf-unresolved-var` — target has an unresolved shell variable or subshell. Flag-bypassable.
4. `rm-rf-globstar` — target uses `**`. Flag-bypassable.
5. `rm-rf-dangerous-glob-unbypassable` — target is literal `.*` or `/*`. **Unbypassable.**
6. `rm-rf-expansion-error` — glob scan failed (EACCES) or symlink detected in scan parent (ELOOP_GUARD). Flag-bypassable.
7. `rm-rf-home` — resolves to a user home. **Unbypassable.**
8. `rm-rf-root` — resolves to `/` or a system top-level. **Unbypassable.**
9. `rm-rf-project-root` — resolves to the project root. Asks for user confirmation (or blocks under `strictMode`).
10. `rm-rf-escape` — resolves outside the project root. Flag-bypassable.
11. `rm-rf-strict` — inside project, not allowlisted. Asks for user confirmation (or blocks under `strictMode`).

**Patterns allowed (default allowlist — 23 basenames):**

`node_modules`, `dist`, `build`, `out`, `.cache`, `tmp`, `.tmp`, `target`, `coverage`, `.next`, `.nuxt`, `.turbo`, `.parcel-cache`, `.vite`, `.svelte-kit`, `.output`, `__pycache__`, `.pytest_cache`, `.mypy_cache`, `.ruff_cache`, `venv`, `.venv`, `vendor`.

Extend via `extraAllowlist` in `clooks.yml`. Non-allowlisted within-project paths receive `ask` (user confirms), not block.

**Known limitations:**

1. **Non-recursive `rm file.ts` is not covered.** The hook ignores rm invocations without `-r`/`-R`/`--recursive`. A `no-bare-rm` sibling could ship later if incidents surface.
2. **Symlink safety.** The hook audits the immediate scan parent for symlinks and fails closed (`rm-rf-expansion-error` with `ELOOP_GUARD`) if any entry matching the glob is a symbolic link — closing the exploit where `build/cache -> /etc` would let `rm -rf build/*` delete `/etc`. One residual gap remains: when rule 4 (`rm-rf-globstar`) has been explicitly bypassed via `ALLOW_DESTRUCTIVE_RM=true`, symlinked directories nested two or more levels under the scan parent are not audited. Opting out of rule 4 means explicitly vouching for the globstar expansion.
3. **Subagent (Agent/Task tool) Bash calls are not covered by PreToolUse hooks.** Upstream [Claude Code issue #34692](https://github.com/anthropics/claude-code/issues/34692) — assumed fixed before release; if not, the hook covers main-session Bash only.
4. **Git submodules.** `git rev-parse --show-toplevel` returns the submodule root, not the parent repo. Paths in the parent repo may be classified as `escape`. Fail-closed direction (produces false blocks, not false allows).

---

### no-auto-confirm

Blocks commands that pipe automatic responses (`yes`, `echo y`, `printf y`, etc.) into interactive prompts. These patterns simulate human input instead of using the command's designed non-interactive interface.

**When to enable:** Always. This hook addresses a real AI agent failure mode where agents bypass confirmation prompts — prompts that exist because the program's author determined the action requires human judgment.

**What to do instead:**
- If the command has a non-interactive flag (`-y`, `--yes`, `--force`, `--non-interactive`, `-auto-approve`), use it.
- If the command has no such flag, the program's author intentionally requires human interaction. Ask the user to run the command.

**Config options:** None. No configuration needed or available.

**Escape hatch:** None. Use the command's designed non-interactive flag, or ask the user to run the command. If adding an escape hatch becomes necessary (commands with no non-interactive flag where the user doesn't want to run it themselves), `ALLOW_AUTO_CONFIRM=true` is a backward-compatible addition. See the feature spec for rationale.

**Patterns blocked:**
- `yes | command`, `yes <word> | command`, `/usr/bin/yes | command`
- `echo y | command`, `echo yes | command` (case-insensitive on y/yes)
- `echo -e|-n|-ne|-en y|yes | command`
- `printf y|yes | command` (case-insensitive)
- Per-segment detection: `cd /tmp && yes | rm -rf *`

---

### no-pasted-placeholder

Blocks `UserPromptSubmit` when the prompt still contains a literal `[Pasted text #N +N lines]` placeholder. Claude Code shows that placeholder in the input box for large pastes; if it survives into the submitted prompt, the paste was not expanded and the prompt references nothing.

**When to enable:** Always. The cost of a blocked false positive is one re-submit; the cost of a false negative is a wasted turn responding to a literal placeholder string.

**Config options:** None.

**Escape hatch:** None. Re-paste the actual content, or remove the placeholder text, and submit again.

**Patterns blocked:**
- `[Pasted text #1 +10 lines]`, `[Pasted text #6 +1 line]`, `[Pasted text #15 +1234 lines]`

**Not blocked:**
- The same string without brackets (e.g. quoted in a meta-discussion).
- Variants without a `+` sign (`[Pasted text #4 7 lines]`) or with `-` (`[Pasted text #3 -5 lines]`) — neither matches the format Claude Code emits.

---

## Contributing

### Regenerating types.d.ts

The `hooks/types.d.ts` file is generated by the clooks CLI. To regenerate after a clooks version update:

```bash
cd <your-clooks-project>
clooks types
cp .clooks/hooks/types.d.ts <path-to-this-pack>/hooks/types.d.ts
```

Do not edit `types.d.ts` by hand.
