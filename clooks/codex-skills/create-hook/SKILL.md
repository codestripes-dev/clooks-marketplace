---
name: create-hook
description: Create or edit a Clooks TypeScript hook, choose events and decisions, test its behavior, and register it in clooks.yml.
---

# Create a Clooks Hook

Read and follow the [shared hook-authoring guide](../../skills/create-hook/SKILL.md).
Resolve that path relative to this loaded skill in the cached plugin, not the
user's project. Use `$clooks:setup` if setup is missing; authoring does not
authorize installing the runtime or changing agent registrations.

Read the guide in sections of about 40 lines so tool-output truncation does not
hide instructions. Continue through the workflow, then consult the event and
type references relevant to the hook.

Apply these Codex constraints when using the guide's event reference:

- Supported events: SessionStart, SessionEnd, SubagentStart, PreToolUse,
  PermissionRequest, PostToolUse, PreCompact, PostCompact, UserPromptSubmit,
  SubagentStop, Stop. Do not scaffold Claude-only events for a Codex hook.
- `ctx.ask({ reason })` works only in PreToolUse handlers through Clooks' shared
  live confirmation. It waits before later sequential hooks continue; `skip`
  abstains without asking, and Codex does not support `defer`. Do not return ask
  from `beforeHook`. Approval does not override another hook's block or native policy.
- `updatedInput` is supported only in sequential PreToolUse hooks. Bash and
  apply_patch updates can replace `command`, not timeout or other shell fields.
  PermissionRequest input updates and UserPromptSubmit title changes are unsupported.
- SessionStart, SessionEnd, SubagentStart, and PostCompact handlers return `skip`.
  Use `injectContext` only on PreToolUse, UserPromptSubmit, PostToolUse,
  SessionStart, or SubagentStart; other observations can use `debugMessage`.
- Use `ctx.provider` when behavior needs to differ between agents. Bash uses
  `toolInput.command`; apply_patch, MCP, and other tools do not acquire Claude's
  file-tool shapes. Inspect their input and preserve opaque argument keys.

Test normal, unrelated, and edge-case inputs with `provider: "codex"` in the
normalized fixture. These tests check the handler, not native hook activation
or whether the adapter accepts every returned field.
