# clooks-example-hooks

Educational hook pack for learning clooks. Contains three hooks that demonstrate lifecycle methods, typed configuration, event handling and debug tooling. The current contract has 22 events; kitchen-sink observes 21 and deliberately excludes WorktreeCreate. Provider event support differs. Install individually to explore how clooks hooks work before writing your own.

## debug-payload

Inspects the JSON-serializable portion of normalized handler context, not the raw native event or a complete context object. AbortSignal is excluded; JSON serialization omits functions and undefined fields. Every handler returns skip: debugging never grants permission or vetoes an action.

**When to enable:** Temporarily during hook development. Only exact `CLOOKS_DEBUG=true` runs the handlers; otherwise `beforeHook` skips before serialization and file writes. This does not eliminate normal runtime/loading overhead.

**Context injection:** Skip-based injection is used for UserPromptSubmit, SessionStart, PostToolUse, PostToolUseFailure, Notification and SubagentStart where the selected adapter supports the event. Codex currently supports the first, second, third and sixth of those events; it does not support PostToolUseFailure or Notification. PreToolUse, PermissionRequest, Stop, SubagentStop, ConfigChange, SessionEnd, InstructionsLoaded, WorktreeRemove, PreCompact, PostCompact, TeammateIdle and TaskCompleted are debug-only. PreToolUse deliberately does not return allow just to inject context. WorktreeCreate remains excluded because it requires success/failure rather than skip.

**Log file and privacy:** Appends unredacted context to `/tmp/clooks-debug/debug-events.log` by default. Set `CLOOKS_LOGDIR` to an explicitly chosen private directory; the override is read on each invocation. Prompts, tool inputs/outputs, paths and history can contain secrets or other sensitive data, which may also appear in injected context and runtime debug output. Directory/file writes are best-effort; failures do not change the skip result. The example does not redact, rotate, expire or remove logs, or guarantee private permissions: restrict access and remove retained data yourself. SessionEnd debug diagnostics are local; native Codex may discard successful stderr. No native delivery guarantee is implied.

**Config options:** None.

## lifecycle-example

Demonstrates `beforeHook` and `afterHook` lifecycle methods alongside typed configuration. Blocks normalized shell-tool use on configured protected branches, naming the actual branch. Otherwise its PreToolUse handler intentionally returns allow; this is a decision-bearing example, not a passive observer. Timing is returned through `event.passthrough({ debugMessage })`, never console stdout. Runtime debug settings control diagnostic display. The module-level timer is only a sequential example, not concurrency-safe.

**When to enable:** When learning how lifecycle methods work, or as a starting point for your own branch-gating hook.

**Config options:**

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `protectedBranches` | `string[]` | `["production"]` | Branch names where Bash is blocked |

Override in `clooks.yml`:

```yaml
lifecycle-example:
  config:
    protectedBranches:
      - production
      - staging
```

## kitchen-sink

Reference hook with skip-only handlers for 21 of the 22 current events, including StopFailure, PermissionDenied, PostCompact and TaskCreated. WorktreeCreate is deliberately omitted: a correct handler must actually create a worktree and return its path, not claim success with cwd. PreToolUse and the four newer handlers are debug-only; no allow, retry, continuation decision or context injection is fabricated. Six events use skip-based injection where supported: UserPromptSubmit, SessionStart, PostToolUse, PostToolUseFailure, Notification and SubagentStart. Other handlers use debug diagnostics. Provider support is not universal; Codex does not expose StopFailure, PermissionDenied or TaskCreated. StopFailure output is ignored natively; debug diagnostics do not guarantee delivery.

This is normalized context, not raw native input. It is unredacted and may contain sensitive prompts, tool data and paths. Unlike debug-payload, kitchen-sink has no environment gate: enable it only temporarily. Runtime debug settings control diagnostic display, while supported context injection can still occur without debug mode.

**When to enable:** Temporarily, when you want to explore what context fields each event provides. Not intended for production use.

**Config options:** None.

## Contributing

### Regenerating types.d.ts

The `hooks/types.d.ts` file contains generated type declarations from the clooks binary. When clooks publishes a new version with type changes, regenerate `types.d.ts` by running `clooks types` from a project with the updated binary, then copy the result here.
