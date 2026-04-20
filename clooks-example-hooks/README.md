# clooks-example-hooks

Educational hook pack for learning clooks. Contains three hooks that demonstrate core features: lifecycle methods, typed configuration, event handling across all 18 events, and debug tooling. Install one or all to explore how clooks hooks work before writing your own.

## debug-payload

Echoes the full event payload back into the conversation context so you can see exactly what data your hooks receive.

**When to enable:** During hook development, when you need to inspect the raw context objects that clooks passes to handlers.

**Escape hatch:** Gated by the `CLOOKS_DEBUG=true` environment variable. When unset or set to any other value, the hook skips immediately via `beforeHook` -- zero overhead.

**Log file:** Writes to `/tmp/clooks-debug/debug-events.log` by default. Override the directory by setting the `CLOOKS_LOGDIR` environment variable.

**Config options:** None.

## lifecycle-example

Demonstrates `beforeHook` and `afterHook` lifecycle methods alongside typed configuration. Blocks Bash tool use on protected branches and logs handler execution time.

**When to enable:** When learning how lifecycle methods work, or as a starting point for your own branch-gating hook.

**Config options:**

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `protectedBranches` | `string[]` | `["production"]` | Branch names where Bash is blocked |

Override in `clooks.yml`:

```yaml
hooks:
  lifecycle-example:
    config:
      protectedBranches:
        - production
        - staging
```

## kitchen-sink

Reference hook with a handler for every one of the 18 clooks events. Each handler returns `skip` (or `success` for WorktreeCreate) and outputs the context fields available for that event.

**When to enable:** Temporarily, when you want to explore what context fields each event provides. Not intended for production use.

**Config options:** None.

## Contributing

### Regenerating types.d.ts

The `hooks/types.d.ts` file contains generated type declarations from the clooks binary. When clooks publishes a new version with type changes, regenerate `types.d.ts` by running `clooks types` from a project with the updated binary, then copy the result here.
