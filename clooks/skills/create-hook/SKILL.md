---
name: clooks:create-hook
description: Author a clooks hook (TypeScript hook for the clooks runtime). Use when the user wants to write or scaffold a hook — including picking events, choosing a decision API, and writing the handler. Covers PreToolUse blocks, PostToolUse observers, lifecycle wrappers, and registration in clooks.yml.
---

# Writing a Clooks Hook

You are helping the user author a hook for the **clooks runtime** — a hook
runtime for AI coding agents (starting with Claude Code). A hook is a
TypeScript file under `.clooks/hooks/` that exports a `meta` object plus one or
more event handlers. The `clooks` binary discovers and runs it on every
matching event.

This skill assumes the user has the `clooks` binary installed (if not, point
them to `/clooks:setup` first).

## What you produce

To complete the task, you must end up with:

1. A hook file at `.clooks/hooks/<name>.ts` (project) or `~/.clooks/hooks/<name>.ts` (user-scope).
2. An entry under that name in `.clooks/clooks.yml` so the runtime registers it.

## Workflow

Follow these steps in order. Each one is small and recoverable.

### 1. Confirm the project is initialized

The hook file imports from `./types`, which only resolves when
`.clooks/hooks/types.d.ts` is present. The runtime also needs
`.clooks/clooks.yml`.

- If `.clooks/clooks.yml` is missing, clooks may no tbe initialized yet. Your MUST inform the user about this, and recommend them to run /clooks:setup first before proceeding.
- If `clooks.yml` is already there but `types.d.ts` is missing or stale (for
  example, after upgrading the `clooks` binary), run `clooks types` to
  refresh it. The command is idempotent. For user-wide hooks under `~/.clooks/`, append `--global` to either command.

### 2. Decide the event and clarify behavior

Ask the user (briefly) what the hook should do. Translate that into:

- **Which event** (e.g., `PreToolUse`, `UserPromptSubmit`, `SessionStart`).
- **Which decision** the handler should return (allow, block, ask, skip, etc.).

Pick the right event from the event-family table at the bottom of this file.
If the user describes the behavior, use the family guidance:

- **"block / prevent / refuse / require confirmation"** → a **guard event**
  (PreToolUse, UserPromptSubmit, PermissionRequest, Stop, SubagentStop,
  ConfigChange, PreCompact). These can return `block`, `ask`, `allow`.
- **"log / observe / notify / measure"** → an **observer event** (PostToolUse,
  SessionStart, Notification, etc.). These mostly only return `skip` — the
  handler runs for side effects.
- **"create a worktree / replace default behavior"** → an **implementation
  event** (`WorktreeCreate`). Returns `success` or `failure`.
- **"keep teammate working / refuse to stop"** → a **continuation event**
  (`TeammateIdle`, `TaskCreated`, `TaskCompleted`). Returns `continue` or
  `stop`.

If the user says "block X tool" without naming an event, default to
`PreToolUse`.

### 3. Scaffold with `clooks new-hook`

Use the binary to create the file. Do not write the scaffold by hand —
`clooks new-hook` produces the canonical template with the right import path,
event handler shape, and decision verb for the family.

```bash
clooks new-hook --name <kebab-case-name> --event <EventName>
```

Flags:

- `--name` (required, kebab-case): e.g. `block-bad-bash`.
- `--event` (default `PreToolUse`): one of the 22 events in the table below.
- `--scope` (default `project`): `project` writes to `.clooks/hooks/`; `user`
  writes to `~/.clooks/hooks/` for user-wide hooks.

The command refuses to overwrite an existing file. If it warns about a missing
`types.d.ts` or `clooks.yml`, run `clooks types` or `clooks init` to fix.

### 4. Fill in the handler

Read the scaffolded file. It looks like this:

```typescript
import type { ClooksHook } from './types'

type Config = {}

export const hook: ClooksHook<Config> = {
  meta: {
    name: 'block-bad-bash',
    config: {},
  },

  PreToolUse(ctx) {
    return ctx.skip()
  },
}
```

Edit it to express the user's intent:

- **Add fields to `Config`** if the hook should be configurable. Provide
  defaults under `meta.config` (the `clooks.yml` entry overrides these).
- **Narrow the context** before reading event-specific fields. For tool events,
  narrow on `ctx.toolName` to get a typed `ctx.toolInput`:

  ```typescript
  if (ctx.toolName !== 'Bash') return ctx.skip()
  // ctx.toolInput.command is now string
  ```

- **Return a decision** using `ctx.<verb>(...)`. See "Looking up shapes"
  below for how to find each verb's exact arguments. The most common forms:

  ```typescript
  return ctx.skip()                              // do nothing
  return ctx.allow()                             // allow this event explicitly
  return ctx.block({ reason: 'why' })            // block with a message to Claude
  return ctx.ask({ reason: 'confirm?' })         // ask the user (PreToolUse only)
  return ctx.success({ path: '/abs/path' })      // WorktreeCreate
  return ctx.continue({ feedback: 'do more' })   // TeammateIdle / TaskCreated / TaskCompleted
  ```

- **Write tight handler logic.** Skip first (cheapest), then narrow, then
  decide. Don't do expensive work for events you don't care about.

A complete `PreToolUse` example that blocks `rm -rf /`:

```typescript
import type { ClooksHook } from './types'

type Config = {
  allowDangerous: boolean
}

export const hook: ClooksHook<Config> = {
  meta: {
    name: 'no-rm-rf-root',
    description: 'Blocks rm -rf / and rm -rf $HOME',
    config: { allowDangerous: false },
  },

  PreToolUse(ctx, config) {
    if (config.allowDangerous) return ctx.skip()
    if (ctx.toolName !== 'Bash') return ctx.skip()

    const command = ctx.toolInput.command
    if (/\brm\s+(-[rRf]+|--recursive)\b.*\s(\/|\$HOME|~)\b/.test(command)) {
      return ctx.block({
        reason: 'Recursive rm against system roots is blocked. Name a project subdirectory instead.',
      })
    }

    return ctx.skip()
  },
}
```

### 5. Verify with `clooks test`

Before registering the hook, prove its logic works in isolation. `clooks
test` runs a single hook handler against a synthetic event payload — no
registration required, no live Claude session, no event capture.

Discover the JSON shape your event needs:

```bash
clooks test example PreToolUse
```

This prints a minimal fixture (Context shape — camelCase, the same shape
your handler reads from `ctx`) plus per-tool input documentation. Substitute
any event name from the table at the bottom of this file.

Then run the hook against a fixture. **Pipe via stdin where possible** —
fixtures are throwaway, no file to clean up:

```bash
clooks test ./.clooks/hooks/no-rm-rf-root.ts <<'EOF'
{
  "event": "PreToolUse",
  "toolName": "Bash",
  "toolInput": { "command": "rm -rf /" },
  "originalToolInput": { "command": "rm -rf /" },
  "toolUseId": "tu_test_0001"
}
EOF
```

If you need a persistent fixture (re-run during iteration, or share with
the user), put the file under `/tmp/` rather than the project root —
fixtures are not source:

```bash
clooks test ./.clooks/hooks/no-rm-rf-root.ts --input /tmp/rm-rf-root.json
```

The output on stdout is the hook's return value as a single JSON line —
pipe to `jq` to assert specific fields. The exit code mirrors the decision:

| Decision                                                   | Exit |
| ---------------------------------------------------------- | ---- |
| `allow`, `skip`, `success`, `continue`, `retry`, `ask`, `defer` | `0`  |
| `block`, `failure`, `stop`                                 | `1`  |
| Handler throw or usage error                               | `2`  |

Run a fixture for each branch your handler can reach: the positive case
(it blocks/decides as intended), the obvious negative (it skips on
unrelated input), and any edge cases the handler tries to be clever about.
For unusual context fields, `clooks test example <Event>` shows the full
shape including optional fields.

### 6. Register in `clooks.yml`

This step is **not optional** — without it, the file you just wrote sits on
disk and never runs in real sessions (`clooks test` reads the file
directly; the runtime engine reads `clooks.yml`). A forgotten registration
is the most common cause of "my hook does nothing."

Add the entry **at the top level** of `.clooks/clooks.yml`, under the hook's
`name`:

```yaml
no-rm-rf-root: {}
```

> **Do not nest the entry inside the `config:` block** at the top of
> `clooks.yml`. That block is for runtime-engine settings (`timeout`,
> `onError`, `maxFailures`, …); putting hook entries there fails validation
> with `unknown key`.

To override config defaults, expand the entry:

```yaml
no-rm-rf-root:
  config:
    allowDangerous: false
```

The override is a **shallow merge** at the top level: each key in `config:`
replaces the corresponding key in `meta.config` outright. Keys you don't
mention keep their `meta.config` defaults. Nested objects and arrays are
replaced wholesale, not deep-merged.

If the hook lives in `~/.clooks/hooks/` (user scope), put its entry in
`~/.clooks/clooks.yml` instead. At runtime, clooks merges three layers in
order: `~/.clooks/clooks.yml` (home) → `.clooks/clooks.yml` (project) →
`.clooks/clooks.local.yml` (local, gitignored). A hook of the same name in
a later layer replaces the earlier layer's entry **atomically** (no
per-key merge across layers). `clooks config` shows the resolved set —
expect to see hooks from all three layers there.

## Lifecycle hooks (optional)

For cross-cutting behavior across multiple event handlers in the same file
(timing, environment gating that applies to any tool, etc.), use the
`beforeHook` and `afterHook` properties:

```typescript
export const hook: ClooksHook<Config> = {
  meta: { name: 'my-hook', config: {} },

  beforeHook(event, config) {
    // Runs before any matched event handler in this file.
    // Can short-circuit by returning event.block({ reason }) or event.skip().
    // Narrow on event.type to read event-specific fields.
  },

  PreToolUse(ctx) { /* ... */ },
  PostToolUse(ctx) { /* ... */ },

  afterHook(event, config) {
    // Observer-only. Reads event.handlerResult; cannot mutate.
    // Use for logging / metrics / notifications.
  },
}
```

`beforeHook` and `afterHook` are not events — they're wrappers around the
event handler in this single file. Don't reach for them unless you have a
real cross-handler concern; one event handler is usually enough.

## Hook composition

Multiple hooks can register for the same event. They run in registration
order (home hooks first, then project, then local; alphabetical within each
layer unless an `order:` list is set). The **first non-`skip` decision wins**
the response back to the agent — later hooks still execute (for side effects
and `debugMessage`s), but their decision is discarded.

If your hook is a security guard and another hook (e.g., a logging hook)
might block first on the same event, set explicit ordering under the event
key in `clooks.yml`:

```yaml
PreToolUse:
  order: [my-credential-guard, prefer-builtin-tools, log-bash-commands]
```

Order lists are scoped to their layer — a project event order can only
reference project-defined hooks, not home ones. When in doubt, run with
`CLOOKS_DEBUG=true`, look at which hook's reason ends up in the engine's
response, and add an `order:` entry if it isn't yours.

## Debugging

The runtime is silent by design — a hook that runs cleanly produces no output
to the agent. When something goes wrong, or when you want to see what the
hook is doing, three mechanisms work together.

### `debugMessage` on every decision

Every decision verb accepts an optional `debugMessage: string`. It does not
affect the decision; it surfaces only when the user runs with
`CLOOKS_DEBUG=true`. Use it to record *why* a hook chose to skip, allow, or
block — especially when a guard has many branches:

```typescript
if (ctx.toolName !== 'Bash') return ctx.skip({ debugMessage: 'not Bash' })
if (!command.includes('rm')) return ctx.skip({ debugMessage: 'not rm' })
return ctx.block({
  reason: 'Refusing rm against system root.',
  debugMessage: 'matched rule: rm-rf-root',
})
```

Prefer `debugMessage` over `console.log` in handlers. Hook stdout is
reserved for the JSON response back to the agent; ad-hoc logging there can
corrupt the event protocol. `debugMessage` flows through the engine's
structured channel.

### `CLOOKS_DEBUG=true`

Setting this environment variable does two things:

1. **Surfaces every `debugMessage`** from your decisions so you can see them.
2. **Captures every event's stdin JSON** to `/tmp/clooks-debug/` (override
   with `CLOOKS_LOGDIR=...`). One file per event, named by nanosecond
   timestamp.

Tell the user how to enable it for a single Claude Code session:

```bash
CLOOKS_DEBUG=true claude
```

Or persist it via their shell profile if they want it on by default. The
captured input files are how you reproduce a misbehaving hook outside the
agent — see below.

### Iterating on a hook in isolation

Use **`clooks test`** (Step 5). It runs your hook against a synthetic event
in the Context shape your handler already programs against, returns the
decision as JSON, and exits with a status code reflecting the outcome.
That's the right tool whenever you want fast feedback during authoring.

### When in doubt

If a hook seems to do nothing, check in this order:

1. **Run it through `clooks test`** with a fixture that should trigger it
   (Step 5). If it doesn't fire there, the bug is in the handler, not the
   runtime. This is the fastest signal.
2. Is the hook **registered** in `clooks.yml`? Unregistered hooks never run
   in real sessions (only via `clooks test`).
3. Does `clooks config` show it under the resolved configuration? If not,
   the file isn't being discovered or the entry is malformed.
4. Run the live session with `CLOOKS_DEBUG=true` and look for the hook's
   `debugMessage` strings.

## Common pitfalls

- **Forgetting registration.** A hook file with no entry in `clooks.yml` never
  runs in real sessions (only via `clooks test`). Always finish step 6.
- **Wrong decision family.** `ctx.block()` does not exist on observer events
  (e.g., `Notification`, `SessionStart`, `WorktreeRemove`). If TypeScript
  complains, you're using the wrong verb — check the event-family table
  below or read the event's `*DecisionMethods` type in `types.d.ts`.
- **Reading `toolInput` without narrowing.** On `PreToolUse`, `ctx.toolInput`
  is a discriminated union over `ctx.toolName`. Always check `toolName` first.
- **Slow handlers.** Hooks run on every matching event. Keep them fast: skip
  the cheap-out cases first, defer expensive checks (filesystem, subprocess
  spawn) to after a clear positive match.

## Event-family table

All 22 events grouped by family. The verbs column lists every decision method
available on `ctx` (and on `event` inside `beforeHook`) for that event.
Anything not listed is a type error.

For the upstream specification of Claude Code's hook events (payload schemas,
exit-code semantics, JSON envelope), see the official docs at
**https://code.claude.com/docs/en/hooks**. Clooks aligns with these events
and adds a few of its own (the implementation and continuation families
below); the JSDoc on each `<EventName>Context` in `types.d.ts` calls out
clooks-specific extensions.

### Guard events — choose an outcome

These events let your hook influence what happens next. Return `block` to
prevent the action, `ask` to require user confirmation (PreToolUse only),
`allow` to approve explicitly (and optionally patch input), `defer` to let
later hooks decide, or `skip` to opt out without taking a position.

| Event              | Verbs                          | Fires when                                                                                                                                                           |
| ------------------ | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PreToolUse`       | allow, ask, block, defer, skip | Before any tool call (Bash, Edit, Write, Read, MCP tools, …). The most common guard. Use to vet commands, patch tool input via `updatedInput`, or require confirmation. |
| `UserPromptSubmit` | allow, block, skip             | The user submits a prompt. Use to inject context (`injectContext`), rewrite session titles, or block prompts that violate workflow rules.                            |
| `PermissionRequest`| allow, block, skip             | Claude Code is about to prompt the user for permission. The hook can answer on the user's behalf — `allow` skips the prompt, `block` denies (with optional `interrupt: true` to halt the turn). |
| `Stop`             | allow, block, skip             | The agent is about to end its turn. `block({ reason })` prevents the stop and tells Claude what to do next — useful for "are you done? did you run the tests?" gates. |
| `SubagentStop`     | allow, block, skip             | A subagent is about to stop. Same shape as `Stop` but scoped to subagent turns.                                                                                      |
| `ConfigChange`     | allow, block, skip             | A settings file (`user_settings`, `project_settings`, `local_settings`, `skills`) changes. Use to reject unsafe edits. `policy_settings` changes cannot be blocked — the verb silently downgrades to `skip`. |
| `PreCompact`       | allow, block, skip             | Before context compaction (manual `/compact` or auto when context fills). Use to snapshot state, refuse compaction at critical moments, or log what's about to be summarized. |

### Observer events — side effects only

These events have already happened (or are about to happen unconditionally).
Your handler runs for logging, metrics, notifications, or external triggers.
Most expose only `skip` because there's no decision to make — the action is
not gated by your return value.

| Event                  | Verbs        | Fires when                                                                                                                              |
| ---------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `PostToolUse`          | block, skip  | After a tool call returns. `block({ reason })` flags the tool result back to the agent so it sees the issue on the next turn (e.g., "your edit broke the build, here's what failed"). |
| `PostToolUseFailure`   | skip         | After a tool call fails. Use for failure logging, alerting, or replaying a captured failure later.                                      |
| `SessionStart`         | skip         | Session begins. Branch on `ctx.source` to differentiate `startup` / `resume` / `clear` / `compact`. Use to inject project context.      |
| `SessionEnd`           | skip         | Session ends. Branch on `ctx.reason` (`clear`, `resume`, `logout`, `prompt_input_exit`, …). Use for session-summary writes.             |
| `InstructionsLoaded`   | skip         | A CLAUDE.md tier loads into context. `ctx.memoryType` indicates `User` / `Project` / `Local` / `Managed`. Use to audit which instruction sets are active. |
| `Notification`         | skip         | Before Claude Code shows a notification (permission prompt, idle prompt, auth success, elicitation dialog). Use to mirror notifications to tmux, Slack, etc. |
| `SubagentStart`        | skip         | A subagent starts. Use for subagent inventory / metrics.                                                                                |
| `WorktreeRemove`       | skip         | A worktree is removed. Use for cleanup of related state outside the worktree.                                                           |
| `PostCompact`          | skip         | After context compaction completes. Use to log what survived or to attach a post-compact context snapshot.                              |
| `PermissionDenied`     | retry, skip  | A permission was denied (by user or by a `PermissionRequest` hook). `retry` hints the model may try again with a different approach — it does **not** reverse the denial. |
| `StopFailure`          | skip         | The agent stopped due to an API failure. Branch on `ctx.error` (`rate_limit`, `authentication_failed`, `billing_error`, `server_error`, `max_output_tokens`, …) — output is dropped upstream, so this is purely for paging / alerting. |

### Implementation events — replace native behavior

Your hook *is* the implementation. Returning `success` provides the result;
`failure` surfaces an error to the user. There is no fall-through to a default.

| Event             | Verbs              | Fires when                                                                                                                                                       |
| ----------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WorktreeCreate`  | success, failure   | Claude Code asks for a new worktree. Your hook is responsible for creating it (e.g., `git worktree add`) and returning `success({ path: '<absolute path>' })`, or `failure({ reason })` if creation cannot proceed. |

### Continuation events — keep a teammate working or stop it

These fire around long-running teammates / tasks (clooks orchestration layer,
not Claude Code itself). `continue({ feedback })` sends instructions back to
the model and keeps it going; `stop({ reason })` terminates; `skip` is a
no-op (default behavior continues).

| Event           | Verbs                  | Fires when                                                                                                                                            |
| --------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TeammateIdle`  | continue, stop, skip   | A teammate has gone idle (no pending work). Use to push the next task or terminate the session.                                                       |
| `TaskCreated`   | continue, stop, skip   | A task is created. `continue({ feedback })` *refuses* the creation and feeds back to the model — useful for enforcing task-quality rules at intake.   |
| `TaskCompleted` | continue, stop, skip   | A task is marked complete. `continue({ feedback })` *refuses* the completion (e.g., "tests didn't pass, keep working").                               |

## Looking up shapes

For exact argument shape, optional fields, and field semantics on any verb,
context, or result type, **read `.clooks/hooks/types.d.ts`**. It is generated
by `clooks types`, JSDoc'd on every export, and authoritative for the user's
installed `clooks` version. Do not rely on memorized field names — read the
file.

Useful entry points to search for:

- `<EventName>Context` — the `ctx` parameter shape (e.g., `PreToolUseContext`,
  `SessionStartContext`). Tells you what fields you can read.
- `<EventName>DecisionMethods` — the verbs available and what each one
  accepts (e.g., `PreToolUseDecisionMethods`, `WorktreeCreateDecisionMethods`).
- `ClooksHook` — the top-level export shape. Confirms which event handler
  names are valid keys.
- `BeforeHookEvent` / `AfterHookEvent` — the lifecycle wrapper signatures.
- Field-shape types like `Reason`, `InjectContext`, `DebugMessage`, `Patch<T>`,
  `UpdatedInput<T>` — composable building blocks that appear inside multiple
  decision methods.

If `types.d.ts` looks out of date (missing a field you expect, version
comment header references an older version than the binary), regenerate with
`clooks types`.
