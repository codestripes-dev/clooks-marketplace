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
