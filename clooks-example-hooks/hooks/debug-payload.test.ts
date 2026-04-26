import { describe, expect, test } from "bun:test"
import { hook } from "./debug-payload"

describe("debug-payload", () => {
  test("beforeHook returns skip when CLOOKS_DEBUG is not set", () => {
    const original = process.env.CLOOKS_DEBUG
    delete process.env.CLOOKS_DEBUG
    const event = {
      type: "PreToolUse",
      input: { toolName: "Bash", toolInput: {} },
      meta: {},
      block: (opts: any) => ({ result: "block", ...opts }),
      skip: (opts: any = {}) => ({ result: "skip", ...opts }),
      passthrough: (opts: any = {}) => ({ result: "passthrough", ...opts }),
    }
    const result = hook.beforeHook!(event as any, {})
    expect((result as any).result).toBe("skip")
    if (original !== undefined) process.env.CLOOKS_DEBUG = original
  })

  test("beforeHook returns void when CLOOKS_DEBUG=true", () => {
    const original = process.env.CLOOKS_DEBUG
    process.env.CLOOKS_DEBUG = "true"
    const event = {
      type: "PreToolUse",
      input: { toolName: "Bash", toolInput: {} },
      meta: {},
      block: (opts: any) => ({ result: "block", ...opts }),
      skip: (opts: any = {}) => ({ result: "skip", ...opts }),
      passthrough: (opts: any = {}) => ({ result: "passthrough", ...opts }),
    }
    const result = hook.beforeHook!(event as any, {})
    expect(result).toBeUndefined()
    if (original === undefined) delete process.env.CLOOKS_DEBUG
    else process.env.CLOOKS_DEBUG = original
  })

  test("PreToolUse handler returns skip with injectContext", () => {
    const ctx = {
      event: "PreToolUse", sessionId: "s1", cwd: "/tmp",
      toolName: "Bash", toolInput: {}, toolUseId: "t1",
      permissionMode: "default", transcriptPath: "/tmp/t.jsonl",
      parallel: false, signal: new AbortController().signal,
      skip: (opts: any = {}) => ({ result: "skip", ...opts }),
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
      skip: (opts: any = {}) => ({ result: "skip", ...opts }),
    }
    const result = hook.SessionStart!(ctx as any, {})
    expect(result.result).toBe("skip")
    expect((result as any).injectContext).toBeDefined()
  })
})
