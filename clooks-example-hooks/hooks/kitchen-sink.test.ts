import { describe, expect, test } from "bun:test"
import { hook } from "./kitchen-sink"

const ctxMethods = {
  skip: (opts: Record<string, unknown> = {}) => ({ result: "skip", ...opts }),
  success: (opts: Record<string, unknown>) => ({ result: "success", ...opts }),
  allow: (opts: Record<string, unknown> = {}) => ({ result: "allow", ...opts }),
  block: (opts: Record<string, unknown> = {}) => ({ result: "block", ...opts }),
}

describe("kitchen-sink", () => {
  test("PreToolUse handler returns skip", () => {
    const ctx = {
      event: "PreToolUse", sessionId: "s1", cwd: "/tmp",
      toolName: "Bash", toolInput: {}, originalToolInput: {},
      toolUseId: "t1", permissionMode: "default",
      transcriptPath: "/tmp/t.jsonl",
      parallel: false, signal: new AbortController().signal,
      ...ctxMethods,
    }
    const result = hook.PreToolUse!(ctx as any, {})
    expect(result.result).toBe("skip")
    expect(Object.keys(result).sort()).toEqual(["debugMessage", "result"])
  })

  test("SessionStart handler returns skip", () => {
    const ctx = {
      event: "SessionStart", sessionId: "s1", cwd: "/tmp",
      source: "startup", permissionMode: "default",
      transcriptPath: "/tmp/t.jsonl",
      parallel: false, signal: new AbortController().signal,
      ...ctxMethods,
    }
    const result = hook.SessionStart!(ctx as any, {})
    expect(result.result).toBe("skip")
  })

  test("TeammateIdle handler returns skip", () => {
    const ctx = {
      event: "TeammateIdle", sessionId: "s1", cwd: "/tmp",
      teammateName: "bot", teamName: "team1",
      permissionMode: "default", transcriptPath: "/tmp/t.jsonl",
      parallel: false, signal: new AbortController().signal,
      ...ctxMethods,
    }
    const result = hook.TeammateIdle!(ctx as any, {})
    expect(result.result).toBe("skip")
  })
})

describe("kitchen-sink current event boundaries", () => {
  test("21 handlers match current events except WorktreeCreate", () => {
    expect(Object.keys(hook).filter(key => !["meta", "beforeHook", "afterHook"].includes(key)).sort()).toEqual([
      "PreToolUse", "PostToolUse", "UserPromptSubmit", "SessionStart", "SessionEnd",
      "Stop", "StopFailure", "SubagentStop", "SubagentStart", "InstructionsLoaded",
      "PostToolUseFailure", "Notification", "PermissionRequest", "PermissionDenied",
      "ConfigChange", "WorktreeRemove", "PreCompact", "PostCompact", "TeammateIdle",
      "TaskCreated", "TaskCompleted",
    ].sort())
    expect(hook.WorktreeCreate).toBeUndefined()
  })

  test.each([
    ["StopFailure", { error: "rate_limit", errorDetails: "inert diagnostic" }, "rate_limit"],
    ["PermissionDenied", { toolName: "Bash", toolInput: { command: "echo inert" }, denialReason: "fixture denial" }, "fixture denial"],
    ["PostCompact", { trigger: "auto", compactSummary: "fixture summary" }, "fixture summary"],
    ["TaskCreated", { taskId: "task-1", taskSubject: "fixture subject", taskDescription: "fixture detail" }, "fixture subject"],
  ] as const)("%s is debug-only skip", (event, fields, marker) => {
    const result = hook[event]!({
      event, sessionId: "fixture", cwd: "/disposable", ...fields,
      signal: new AbortController().signal,
      ...ctxMethods,
    } as never, {})
    expect(result).toMatchObject({ result: "skip", debugMessage: expect.stringContaining(marker) })
    expect(Object.keys(result).sort()).toEqual(["debugMessage", "result"])
    expect(JSON.stringify(result)).not.toContain("AbortSignal")
  })
})
