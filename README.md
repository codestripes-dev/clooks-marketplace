# clooks-marketplace

The official plugin marketplace for [clooks](https://clooks.cc) — a TypeScript hook runtime for AI coding agents.

Add this marketplace to Claude Code or Codex to install Clooks and curated hook
packs. Hooks are vendored locally, with no silent updates.

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

Run `/clooks:setup` in Claude Code to install Clooks and initialize your project.

### Codex

```bash
codex plugin marketplace add codestripes-dev/clooks-marketplace
codex plugin add clooks@clooks-marketplace
```

Run `$clooks:setup` in Codex to install Clooks and initialize your project.
Then add the packs you want:

```bash
codex plugin add clooks-core-hooks@clooks-marketplace
codex plugin add clooks-project-hooks@clooks-marketplace
codex plugin add clooks-example-hooks@clooks-marketplace
```

Codex installs packs user-wide by default.

Prefer to install clooks without plugins? See the [clooks README](https://github.com/codestripes-dev/clooks#other-install-methods) for prebuilt binaries and source builds.

## Plugins in this marketplace

### `clooks`

The runtime setup plugin. Reminds you when Clooks needs installing and includes
the `setup` and `create-hook` skills. **Install this first.**

To author a hook, use `/clooks:create-hook` in Claude Code or `$clooks:create-hook`
in Codex.

```bash
claude plugin install clooks
```

Source: [`./clooks`](./clooks) · [Claude manifest](./clooks/.claude-plugin/plugin.json) · [Codex manifest](./clooks/.codex-plugin/plugin.json)

---

### `clooks-core-hooks`

Curated production hooks for command safety, git protection, tool hygiene, and tmux notifications. Most work out of the box; tmux notifications are opt-in.

| Hook | What it does |
|------|--------------|
| **no-compound-commands** | Blocks `&&`, `\|\|`, `;` in Bash commands. Escape via `ALLOW_COMPOUND=true`. |
| **no-rm-rf** | Blocks recursive rm against home, system dirs, and project-root escapes. Asks for within-project non-artifact deletes. Build artifacts (`node_modules`, `dist`, …) allowed. Escape via `ALLOW_DESTRUCTIVE_RM=true`. |
| **no-destructive-git** | Blocks dangerous git ops: force push, `reset --hard`, `clean -f`, stash drop, broad `git add`, and 8 more. |
| **no-auto-confirm** | Blocks piped auto-responses (`yes \|`, `echo y \|`, `printf 'y\n' \|`). Encourages designed non-interactive flags. |
| **no-pasted-placeholder** | Blocks prompts containing unexpanded paste placeholders. |
| **prefer-builtin-tools** | Prefers the agent's built-in tools over equivalent shell commands. |
| **no-bare-mv** | Rewrites bare `mv` to `git mv` for tracked files; passes through for untracked. |
| **tmux-notifications** | Sets tmux window status red on idle/permission prompts, flashes the pane, resets on activity. No-ops outside tmux. Not auto-enabled. |

```bash
claude plugin install clooks-core-hooks --scope user
```

Source: [`./clooks-core-hooks`](./clooks-core-hooks) · [README](./clooks-core-hooks/README.md)

---

### `clooks-project-hooks`

Project hooks for your package manager, protected paths, and preferred scripts. Configure them in `clooks.yml`; protected paths have built-in defaults.

| Hook | What it does |
|------|--------------|
| **js-package-manager-guard** | Blocks wrong JS/TS package managers, runners, and runtimes. Configure `allowed` in `clooks.yml`. Emits a SessionStart warning when unconfigured. |
| **no-edit-protected** | Guards lock files, vendor directories, and minified assets against edits. Toggle built-in groups or add custom `rules`. |
| **prefer-project-scripts** | Prefers equivalent project scripts over direct CLI commands. Configure `mappings` in `clooks.yml`. Not auto-enabled. |

```bash
claude plugin install clooks-project-hooks --scope project
```

Source: [`./clooks-project-hooks`](./clooks-project-hooks) · [README](./clooks-project-hooks/README.md)

---

### `clooks-example-hooks`

Educational pack for learning the clooks authoring model. Not meant for production use — read the source, install individually to experiment, then write your own.

| Hook | What it teaches |
|------|-----------------|
| **debug-payload** | Environment-variable gating, multi-event handling, and context logging |
| **lifecycle-example** | `beforeHook`/`afterHook` lifecycle, configurable defaults, and branch-based gating |
| **kitchen-sink** | Reference handlers showing the context available across events |

```bash
claude plugin install clooks-example-hooks
```

Source: [`./clooks-example-hooks`](./clooks-example-hooks) · [README](./clooks-example-hooks/README.md)

## How this marketplace works

Marketplace manifests point each agent to the plugins in this repository:
`.claude-plugin/marketplace.json` for Claude Code and
`.agents/plugins/marketplace.json` for Codex. Hook packs share this layout:

```
<plugin-name>/
├── .claude-plugin/plugin.json   # Claude Code plugin manifest
├── clooks-pack.json             # clooks pack manifest (hook packs only)
├── hooks/                       # .ts hook files + co-located .test.ts
└── README.md
```

When you install a pack:

1. Your agent downloads the plugin into its plugin cache.
2. Clooks copies the hooks into `.clooks/vendor/plugin/<pack-name>/` (or `~/.clooks/vendor/plugin/<pack-name>/` for user-wide hooks) and registers them in `clooks.yml`.
3. Commit project hooks and configuration so teammates use the same copies.
4. Updates are explicit: refresh the plugin cache, run `clooks update plugin:<pack-name>`, and review the diff before committing.

For Codex, refresh the cache with `codex plugin add <pack-name>@clooks-marketplace`.

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
