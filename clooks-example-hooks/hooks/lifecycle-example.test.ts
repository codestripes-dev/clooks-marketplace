import { describe, test, expect } from "bun:test"
import { hook } from "./lifecycle-example"
import type { BeforeHookEvent, AfterHookEvent, HookEventMeta } from "./types"

function makeMeta(overrides?: Partial<HookEventMeta>): HookEventMeta {
  return {
    gitRoot: "/repo",
    gitBranch: "main",
    platform: "linux",
    hookName: "lifecycle-example",
    hookPath: "/repo/.clooks/hooks/lifecycle-example.ts",
    timestamp: new Date().toISOString(),
    clooksVersion: "0.0.1",
    configPath: "/repo/.clooks/clooks.yml",
    ...overrides,
  }
}

function makeBeforeEvent(overrides: { type: any; input: any; meta: HookEventMeta }): BeforeHookEvent {
  return {
    ...overrides,
    block: (opts: any) => ({ result: "block", ...opts }),
    skip: (opts?: any) => ({ result: "skip", ...(opts ?? {}) }),
    passthrough: (opts?: any) => ({ result: "passthrough", ...(opts ?? {}) }),
  } as unknown as BeforeHookEvent
}

function makeAfterEvent(overrides: { type: any; input: any; meta: HookEventMeta; handlerResult: any }): AfterHookEvent {
  return {
    ...overrides,
    passthrough: (opts?: any) => ({ result: "passthrough", ...(opts ?? {}) }),
  } as unknown as AfterHookEvent
}

describe("lifecycle-example", () => {
  test("beforeHook blocks Bash on production branch", async () => {
    const event = makeBeforeEvent({
      type: "PreToolUse",
      input: { toolName: "Bash", toolInput: {}, event: "PreToolUse" },
      meta: makeMeta({ gitBranch: "production" }),
    })

    const result = await hook.beforeHook!(event, hook.meta.config!)
    expect(result).toBeDefined()
    expect((result as any).result).toBe("block")
    expect((result as any).reason).toContain("production")
  })

  test("beforeHook returns void on non-production branches", async () => {
    const event = makeBeforeEvent({
      type: "PreToolUse",
      input: { toolName: "Bash", toolInput: {}, event: "PreToolUse" },
      meta: makeMeta({ gitBranch: "main" }),
    })

    const result = await hook.beforeHook!(event, hook.meta.config!)
    expect(result).toBeUndefined()
  })

  test("beforeHook returns void for non-Bash tools on production branch", async () => {
    const event = makeBeforeEvent({
      type: "PreToolUse",
      input: { toolName: "Read", toolInput: {}, event: "PreToolUse" },
      meta: makeMeta({ gitBranch: "production" }),
    })

    const result = await hook.beforeHook!(event, hook.meta.config!)
    expect(result).toBeUndefined()
  })

  test("beforeHook blocks Bash on custom protected branch", async () => {
    const event = makeBeforeEvent({
      type: "PreToolUse",
      input: { toolName: "Bash", toolInput: {}, event: "PreToolUse" },
      meta: makeMeta({ gitBranch: "staging" }),
    })

    const result = await hook.beforeHook!(event, { protectedBranches: ["staging"] })
    expect(result).toBeDefined()
    expect((result as any).result).toBe("block")
  })

  test("afterHook computes positive duration", async () => {
    const beforeEvent = makeBeforeEvent({
      type: "PreToolUse",
      input: { toolName: "Bash", toolInput: {}, event: "PreToolUse" },
      meta: makeMeta(),
    })

    await hook.beforeHook!(beforeEvent, hook.meta.config!)

    const afterEvent = makeAfterEvent({
      type: "PreToolUse",
      input: { toolName: "Bash", toolInput: {}, event: "PreToolUse" },
      handlerResult: { result: "allow" },
      meta: makeMeta(),
    })

    const logs: string[] = []
    const origLog = console.log
    console.log = (...args: unknown[]) => { logs.push(args.join(" ")) }
    try {
      await hook.afterHook!(afterEvent, hook.meta.config!)
    } finally {
      console.log = origLog
    }

    expect(logs.length).toBe(1)
    expect(logs[0]).toContain("[lifecycle-example]")
    expect(logs[0]).toContain("ms")
  })

  test("handler returns allow", () => {
    const ctx = {
      toolName: "Bash",
      toolInput: {},
      allow: (opts: object = {}) => ({ result: "allow", ...opts }),
      ask: (opts: object = {}) => ({ result: "ask", ...opts }),
      block: (opts: object = {}) => ({ result: "block", ...opts }),
      defer: (opts: object = {}) => ({ result: "defer", ...opts }),
      skip: (opts: object = {}) => ({ result: "skip", ...opts }),
    }
    const result = hook.PreToolUse!(ctx as any, hook.meta.config!)
    expect(result).toEqual({ result: "allow" })
  })
})
