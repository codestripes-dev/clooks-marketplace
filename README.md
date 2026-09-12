# clooks-marketplace

The official plugin marketplace for [clooks](https://clooks.cc) — a TypeScript hook runtime for AI coding agents.

This repository provides setup plugins for Claude Code and Codex,
plus curated hook packs distributed through either agent. Installed hooks are
copied locally for review; existing vendor copies are not silently updated.

- **Home:** [clooks.cc](https://clooks.cc)
- **Runtime:** [codestripes-dev/clooks](https://github.com/codestripes-dev/clooks)
- **License:** MIT

## Contents

- [Quick start](#quick-start)
- [Plugins in this marketplace](#plugins-in-this-marketplace)
  - [`clooks`](#clooks) — runtime plugin
  - [`clooks-core-hooks`](#clooks-core-hooks) — zero-config safety + hygiene
  - [`clooks-project-hooks`](#clooks-project-hooks) — project-configured guardrails
  - [`clooks-example-hooks`](#clooks-example-hooks) — educational reference pack
- [How this marketplace works](#how-this-marketplace-works)
- [Building your own hook pack](#building-your-own-hook-pack)
- [Contributing](#contributing)

## Quick start

### Claude Code

```bash
# 1. Add this marketplace to Claude Code
claude plugin marketplace add codestripes-dev/clooks-marketplace

# 2. Install the setup plugin and hook packs
claude plugin install clooks
claude plugin install clooks-core-hooks --scope user
claude plugin install clooks-project-hooks --scope project
```

Run `/clooks:setup` in Claude Code. Setup installs or reuses the
runtime and initializes the selected project, with an optional offer of user-wide
setup. Startup only provides a reminder when needed; it never installs or runs
setup automatically. Make sure your agent can find `clooks` on PATH and approve
hooks when prompted. Review pack
configuration: `tmux-notifications` and `prefer-project-scripts` are opt-in, and
project hooks have their own defaults and configuration requirements.

### Codex

```bash
codex plugin marketplace add codestripes-dev/clooks-marketplace
codex plugin add clooks@clooks-marketplace
```

Then run `$clooks:setup` in Codex. Use `$clooks:setup check` to check your
installation and `$clooks:setup update` to update it. Setup configures Codex hooks
in your project. You can also ask it to configure both agents or user-wide hooks.
Optional packs can be installed separately:

```bash
codex plugin add clooks-core-hooks@clooks-marketplace
codex plugin add clooks-project-hooks@clooks-marketplace
codex plugin add clooks-example-hooks@clooks-marketplace
```

With the runtime initialized, the next valid hook event discovers enabled packs.
Codex installs activate packs user-wide by default; a pack's name does not select
project scope. Review the resulting Clooks configuration and opt-in hooks.

Plugin setup is tested with Codex CLI `0.154.0`; a minimum version has not been
established. See [test coverage and limitations](https://github.com/codestripes-dev/clooks/blob/master/docs/domain/testing/codex-native.md#native-plugin-onboarding)
for the isolated, scripted test setup.

### Binary Selection

Both setup skills use the same installer: an executable PATH binary wins, followed
by `~/.local/bin/clooks`. Reuse validates `--version` without downloading or editing
profiles. Missing binaries are downloaded with checksum verification; broken
binaries or `CLOOKS_VERSION` mismatches fail rather than silently replacing them.
Explicit update replaces only a managed installation, refusing to overwrite or
shadow external PATH installations. Use their original installation method instead.

Setup uses the resolved absolute path for init. A managed binary off the agent's
PATH still needs PATH correction; successful init alone does not make hooks ready.
Child-shell exports or profile edits cannot repair a running agent's environment.
Relaunch with corrected PATH if needed, and review native hook trust separately.

Prefer to install clooks without plugins? See the [clooks README](https://github.com/codestripes-dev/clooks#other-install-methods) for prebuilt binaries and source builds.

## Plugins in this marketplace

### `clooks`

Sets up the Clooks runtime using `/clooks:setup` in Claude Code or `$clooks:setup`
in Codex. At startup, it reminds you if Clooks is missing or unavailable on PATH.
The reminder never installs or configures anything.

```bash
claude plugin install clooks
```

Source: [`./clooks`](./clooks) · [Claude manifest](./clooks/.claude-plugin/plugin.json) · [Codex manifest](./clooks/.codex-plugin/plugin.json)

---

### `clooks-core-hooks`

Curated zero-config production hooks — command safety, git protection, tool hygiene, tmux notifications. Every hook works out of the box with no per-project setup.

| Hook | What it does |
|------|--------------|
| **no-compound-commands** | Blocks `&&`, `\|\|`, `;` in Bash commands. Escape via `ALLOW_COMPOUND=true`. |
| **no-rm-rf** | Blocks recursive rm against home, system dirs, and project-root escapes. Asks for within-project non-artifact deletes. Build artifacts (`node_modules`, `dist`, …) allowed. Escape via `ALLOW_DESTRUCTIVE_RM=true`. |
| **no-destructive-git** | Blocks dangerous git ops: force push, `reset --hard`, `clean -f`, stash drop, broad `git add`, and 8 more. |
| **no-auto-confirm** | Blocks piped auto-responses (`yes \|`, `echo y \|`, `printf 'y\n' \|`). Encourages designed non-interactive flags. |
| **no-pasted-placeholder** | Checks `[Pasted text #N +N lines]` and `[Pasted Content N chars]` on any provider as a heuristic for unexpanded pastes; exempts prompts starting with `<task-notification>`. |
| **prefer-builtin-tools** | Blocks bash commands that duplicate Claude Code tools (`cat`→Read, `grep`→Grep, `find`→Glob, `sed -i`→Edit, `echo >`→Write, and 4 more). |
| **no-bare-mv** | Rewrites bare `mv` to `git mv` for tracked files; passes through for untracked. |
| **tmux-notifications** | Sets tmux window status red on idle/permission prompts, flashes the pane, resets on activity. No-ops outside tmux. Not auto-enabled. |

```bash
claude plugin install clooks-core-hooks --scope user
```

Source: [`./clooks-core-hooks`](./clooks-core-hooks) · [README](./clooks-core-hooks/README.md)

---

### `clooks-project-hooks`

Project-configured hooks that encode decisions only you can make. Install after committing to a package manager, identifying protected paths, or wrapping CLI tools in scripts — each hook is dormant until configured.

| Hook | What it does |
|------|--------------|
| **js-package-manager-guard** | Blocks wrong JS/TS package managers, runners, and runtimes. Configure `allowed` in `clooks.yml`. Emits a SessionStart warning when unconfigured. |
| **no-edit-protected** | Blocks Claude Write/Edit/MultiEdit and Codex native apply_patch on protected paths, including both move paths and root/nested lock files such as bun.lock. Toggle built-in groups or add custom `rules`; NotebookEdit is not intercepted. |
| **prefer-project-scripts** | Blocks mapped direct invocations only when the recommended package script has the same literal executable and complete arguments. Unverifiable recommendations skip. Configure `mappings` in `clooks.yml`; not auto-enabled. |

```bash
claude plugin install clooks-project-hooks --scope project
```

Source: [`./clooks-project-hooks`](./clooks-project-hooks) · [README](./clooks-project-hooks/README.md)

---

### `clooks-example-hooks`

Educational pack for learning the clooks authoring model. Not meant for production use — read the source, install individually to experiment, then write your own.

| Hook | What it teaches |
|------|-----------------|
| **debug-payload** | Opt-in serializable normalized-context inspection; skip-only event handling and best-effort unredacted logs. PreToolUse/PostCompact/SessionEnd are debug-only. |
| **lifecycle-example** | Configured branch gating with intentional allow otherwise; timing via lifecycle debug passthrough, not stdout |
| **kitchen-sink** | Skip-only normalized-context reference for 21 events; WorktreeCreate deliberately omitted |

```bash
claude plugin install clooks-example-hooks
```

Source: [`./clooks-example-hooks`](./clooks-example-hooks) · [README](./clooks-example-hooks/README.md)

## How this marketplace works

A Claude Code marketplace uses `.claude-plugin/marketplace.json` to point at its
plugins. Hook packs here follow this layout:

```
<plugin-name>/
├── .claude-plugin/plugin.json   # Claude Code plugin manifest
├── clooks-pack.json             # clooks pack manifest (hook packs only)
├── hooks/                       # .ts hook files + co-located .test.ts
└── README.md
```

The onboarding `clooks/` package additionally has `.codex-plugin/plugin.json`,
`codex-skills/` and `codex-hooks/`. The Codex catalog at
`.agents/plugins/marketplace.json` points to that same package. Claude retains its
own `skills/` tree; both agents use `skills/setup/scripts/install.sh`.
The Codex catalog also lists the three data-only packs, using their existing
`.claude-plugin/plugin.json` manifests without duplicate Codex manifests.

When you install a pack:

1. Your agent downloads the plugin into its plugin cache.
2. Clooks discovers enabled packs and copies hooks to `.clooks/vendor/plugin/<pack-name>/` for project scope or `~/.clooks/vendor/plugin/<pack-name>/` for user scope, registering them in the matching config.
3. Commit project vendor files and configuration. Teammates reuse those copies after installing/registering the runtime and satisfying native trust; there is no `hooks.lock` yet.
4. After refreshing the plugin cache, run `clooks update plugin:<pack-name>`, then review the vendor diff and preserve any local customizations.

For Codex, refresh the cache with `codex plugin add <pack-name>@clooks-marketplace`.
Custom hooks and individual `clooks add` GitHub blob URLs remain supported;
nested `/tree/.../<pack>` URLs do not select a pack in this monorepo.

Plugin metadata updates do not automatically update runtime binaries or existing
vendored hook copies. Match package and catalog release versions where declared;
keep numeric `clooks-pack.json` `version: 1` as the schema version. Runtime assets
must be available before onboarding metadata offers their release.

See the [clooks docs](https://github.com/codestripes-dev/clooks#vendoring--updates) for the full vendoring/update flow.

## Building your own hook pack

A hook pack is a data-only Claude Code plugin that ships clooks hooks. You can publish your own via a personal GitHub repo, an internal company marketplace, or by forking this one. The minimum structure:

```
your-pack/
├── .claude-plugin/plugin.json   # name, version, author, repository
├── clooks-pack.json             # hook registry with events + descriptions
├── hooks/
│   ├── my-hook.ts               # one hook per file
│   ├── my-hook.test.ts          # co-located tests
│   └── types.d.ts               # generated by `clooks types`
└── README.md
```

Start from the smallest working example: [clooks-example-hooks](./clooks-example-hooks/). For production-grade patterns (typed config, lifecycle methods, multi-event handlers, circuit-breaker-aware error paths), study [clooks-core-hooks](./clooks-core-hooks/).

The hook contract itself — `meta` + event handlers + return values — is documented in the [clooks README](https://github.com/codestripes-dev/clooks#write-your-own-hook).

### Publishing

Any public git repo with a `.claude-plugin/marketplace.json` at the root works as a marketplace. Point Claude Code at it:

```bash
claude plugin marketplace add <owner>/<repo>
claude plugin install <pack-name> --scope project
```

If you'd like a pack distributed through this marketplace, see [Contributing](#contributing).

## Contributing

Bugs, new hook ideas, and pack submissions welcome. File an issue or open a PR on this repo.

For hook packs that are a good fit for the curated marketplace, open an issue describing the pack first — production packs here should be self-contained, well-tested (one `.test.ts` per hook), and solve a problem that applies broadly across projects.

## License

MIT — see [LICENSE](./LICENSE).
