import { describe, expect, test } from "bun:test"
import { hook } from "./debug-payload"

describe("debug-payload", () => {
  test("beforeHook skips when CLOOKS_DEBUG is not set", () => {
    const original = process.env.CLOOKS_DEBUG
    delete process.env.CLOOKS_DEBUG
    let skipped = false
    const event = {
      type: "PreToolUse",
      input: { toolName: "Bash", toolInput: {} },
      meta: {},
      respond() { skipped = true },
    }
    hook.beforeHook!(event as any, {})
    expect(skipped).toBe(true)
    if (original !== undefined) process.env.CLOOKS_DEBUG = original
  })

  test("PreToolUse handler returns skip with injectContext", () => {
    const ctx = {
      event: "PreToolUse", sessionId: "s1", cwd: "/tmp",
      toolName: "Bash", toolInput: {}, toolUseId: "t1",
      permissionMode: "default", transcriptPath: "/tmp/t.jsonl",
      parallel: false, signal: new AbortController().signal,
    }
    const result = hook.PreToolUse!(ctx as any, {})
    expect(result.result).toBe("skip")
    expect((result as any).injectContext).toBeDefined()
  })

  test("SessionStart handler returns skip with injectContext", () => {
    const ctx = {
      event: "SessionStart", sessionId: "s1", cwd: "/tmp",
      source: "startup", permissionMode: "default",
      transcriptPath: "/tmp/t.jsonl",
      parallel: false, signal: new AbortController().signal,
    }
    const result = hook.SessionStart!(ctx as any, {})
    expect(result.result).toBe("skip")
    expect((result as any).injectContext).toBeDefined()
  })
})
