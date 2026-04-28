# clooks-marketplace

The official plugin marketplace for [clooks](https://clooks.cc) — a TypeScript hook runtime for AI coding agents.

This repo is a Claude Code plugin marketplace. Add it once and you can install the clooks runtime and curated hook packs with a single command per pack. Hooks are vendored into your project and pinned — no silent updates, no supply-chain surprises.

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

```bash
# 1. Add this marketplace to Claude Code
claude plugin marketplace add codestripes-dev/clooks-marketplace

# 2. Install the runtime plus the core packs
claude plugin install clooks
claude plugin install clooks-core-hooks --scope user
claude plugin install clooks-project-hooks --scope project
```

Reload Claude Code. On first session start you'll be prompted to run `/clooks:setup`, which installs the `clooks` binary and initializes the project. The eight hooks in `clooks-core-hooks` activate immediately; `clooks-project-hooks` requires a few lines in `clooks.yml` before it starts enforcing rules.

Prefer to install clooks without plugins? See the [clooks README](https://github.com/codestripes-dev/clooks#other-install-methods) for prebuilt binaries and source builds.

## Plugins in this marketplace

### `clooks`

The runtime plugin. Registers a SessionStart bootstrap hook that checks whether the `clooks` binary is installed, and ships the `/clooks:setup` skill to install it. **Install this first.**

```bash
claude plugin install clooks
```

Source: [`./clooks`](./clooks) · Manifest: [`plugin.json`](./clooks/.claude-plugin/plugin.json)

---

### `clooks-core-hooks`

Curated zero-config production hooks — command safety, git protection, tool hygiene, tmux notifications. Every hook works out of the box with no per-project setup.

| Hook | What it does |
|------|--------------|
| **no-compound-commands** | Blocks `&&`, `\|\|`, `;` in Bash commands. Escape via `ALLOW_COMPOUND=true`. |
| **no-rm-rf** | Blocks recursive rm against home, system dirs, and project-root escapes. Asks for within-project non-artifact deletes. Build artifacts (`node_modules`, `dist`, …) allowed. Escape via `ALLOW_DESTRUCTIVE_RM=true`. |
| **no-destructive-git** | Blocks dangerous git ops: force push, `reset --hard`, `clean -f`, stash drop, broad `git add`, and 8 more. |
| **no-auto-confirm** | Blocks piped auto-responses (`yes \|`, `echo y \|`, `printf 'y\n' \|`). Encourages designed non-interactive flags. |
| **no-pasted-placeholder** | Blocks `UserPromptSubmit` when the prompt still contains a literal `[Pasted text #N +N lines]` placeholder — signals an unexpanded paste. |
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
| **no-edit-protected** | Blocks Write/Edit/MultiEdit/NotebookEdit on protected paths (lock files, vendor dirs, minified assets). Toggle built-in groups or add custom `rules`. |
| **prefer-project-scripts** | Blocks bare CLI invocations when project scripts exist (`eslint src/` → `bun run lint`). Configure `mappings` in `clooks.yml`. Not auto-enabled. |

```bash
claude plugin install clooks-project-hooks --scope project
```

Source: [`./clooks-project-hooks`](./clooks-project-hooks) · [README](./clooks-project-hooks/README.md)

---

### `clooks-example-hooks`

Educational pack for learning the clooks authoring model. Not meant for production use — read the source, install individually to experiment, then write your own.

| Hook | What it teaches |
|------|-----------------|
| **debug-payload** | Environment-variable gating via `beforeHook`, multi-event handling, file logging |
| **lifecycle-example** | `beforeHook`/`afterHook` lifecycle, config schema with defaults, branch-based gating |
| **kitchen-sink** | One handler per event — reference for available context fields |

```bash
claude plugin install clooks-example-hooks
```

Source: [`./clooks-example-hooks`](./clooks-example-hooks) · [README](./clooks-example-hooks/README.md)

## How this marketplace works

A Claude Code marketplace is just a git repo with a `.claude-plugin/marketplace.json` manifest pointing at one or more plugins. Each plugin here follows the same layout:

```
<plugin-name>/
├── .claude-plugin/plugin.json   # Claude Code plugin manifest
├── clooks-pack.json             # clooks pack manifest (hook packs only)
├── hooks/                       # .ts hook files + co-located .test.ts
└── README.md
```

When you install a pack:

1. Claude Code downloads the plugin into its plugin cache.
2. The `clooks` runtime vendors the hooks into `.clooks/vendor/<pack-name>/` and records their SHAs in `hooks.lock`.
3. The vendor directory and lockfile are **committed to your repo**. Your teammates clone and the same hook versions run for everyone.
4. Updates are explicit: after `claude plugin update` refreshes the cache, run `clooks update plugin:<pack-name>` to pull the new version into your vendor directory, then review the diff before committing.

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
