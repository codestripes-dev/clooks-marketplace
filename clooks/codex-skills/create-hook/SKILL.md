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

## Codex events and decisions

These are the events supported by the Clooks Codex adapter. Shared TypeScript
types also expose capabilities for other agents; compiling a hook does not mean
every field is supported by Codex. Use this table alongside the installed types.

| Event | Handler decisions | Context injection | Behavior |
| --- | --- | --- | --- |
| `SessionStart` | `skip` | yes | Session startup observation. |
| `SubagentStart` | `skip` | yes | Child startup observation; cannot veto startup. |
| `PreToolUse` | `allow`, `ask`, `block`, `skip` | yes | Block prevents the pending call; allow retains native permissions and sandbox restrictions. |
| `PermissionRequest` | `allow`, `block`, `skip` | no | Answer a native permission request; skip leaves the native approval flow in place. |
| `PostToolUse` | `block`, `skip` | yes | Block supplies feedback after execution; it cannot undo the tool's effects. |
| `UserPromptSubmit` | `allow`, `block`, `skip` | yes | Block rejects the submitted prompt. |
| `PreCompact` | `allow`, `block`, `skip` | no | Block prevents compaction. |
| `PostCompact` | `skip` | no | Observation after compaction; no rollback. |
| `SubagentStop` | `allow`, `block`, `skip` | no | Block requests that the child continue working. |
| `Stop` | `allow`, `block`, `skip` | no | Block requests that the agent continue working. |
| `SessionEnd` | `skip` | no | Closure observation; `reason` is `other`. No closure veto or model-facing feedback. |
| `Interrupt` | `skip` | no | Codex-only root-turn cancellation observation; cannot cancel the interruption or resume the turn. |

Events not listed here are unsupported by this adapter. Do not scaffold them for
a Codex-only hook. SessionEnd and Interrupt have a three-second total pipeline
budget: keep cleanup short and do not rely on a final model turn. `debugMessage`
is available for diagnostics, but SessionEnd diagnostics are local only.

## Input, approvals, and limitations

- Use `ctx.agent` only when behavior differs between agents. Known tools stay
  typed: Codex `exec_command` is exposed as `Bash` with `toolInput.command`.
  `apply_patch`, MCP, and other local tools retain their native input keys, not
  Claude's Edit/Write shapes. Narrow unknown-tool input before accessing fields.
- `ctx.ask({ reason })` works only in PreToolUse handlers through Clooks' shared
  live confirmation. It waits before later sequential hooks continue; `skip`
  abstains without asking, and Codex does not support `defer`. Do not return ask
  from `beforeHook`. Approval does not override another hook's block or native policy.
- `updatedInput` works on sequential PreToolUse allow/ask decisions only. Bash
  and `apply_patch` can replace `command`, not timeout or other shell fields.
  MCP and ordinary local function tools with object input support field patches:
  undefined leaves a field alone, null removes it, and untouched fields survive.
  Later sequential hooks see the validated result; Codex receives a full
  replacement. Parallel rewrites are rejected. Native `write_stdin` polling does
  not fire PreToolUse and has no rewrite contract.
- MCP input may be any JSON value, including a raw argument string; non-object
  input can be inspected or bound to an approval, but not patched. Non-object
  local function input is currently rejected. Do not cast it into an object.
- PermissionRequest input/permission updates and `interrupt: true` are rejected.
  `interrupt: false` on block is accepted as the native default, not an extra
  capability. UserPromptSubmit `sessionTitle` and PostToolUse
  `updatedMcpToolOutput` are unsupported.
- `injectContext` is supported only where marked above, including PreToolUse
  skip. An allow reason is a human-facing annotation, not model context; use
  `injectContext` when the agent needs information. Configured file handoff is
  supported; let the runtime manage it instead of implementing a file protocol.
- Unsupported decisions or fields are rejected, not silently ignored, even
  when a field is false or null (except PermissionRequest `interrupt: false`).

Test normal, unrelated, and edge-case inputs with `agent: "codex"` in the
normalized fixture. These tests check the handler, not native hook activation
or whether the adapter accepts every returned field.
