// kitchen-sink — Handler for every clooks event
//
// Reference hook showing what context fields each event provides.
// NOT intended for production use — install it temporarily to explore
// the data available to your hooks, then uninstall.
//
// Every handler returns "skip" so the hook never interferes with
// normal operation. Output goes to injectContext where supported,
// debugMessage otherwise.

import type { ClooksHook } from "./types"

function formatContext(ctx: Record<string, unknown>): string {
  const { signal: _, ...rest } = ctx
  return Object.entries(rest)
    .filter(([, v]) => typeof v !== "function")
    .map(([k, v]) => `  ${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join("\n")
}

function injectOpts(event: string, ctx: Record<string, unknown>): { injectContext: string; debugMessage: string } {
  return {
    injectContext: `[kitchen-sink] ${event} context:\n${formatContext(ctx)}`,
    debugMessage: `kitchen-sink: ${event}`,
  }
}

function debugOpts(event: string, ctx: Record<string, unknown>): { debugMessage: string } {
  return {
    debugMessage: `[kitchen-sink] ${event} context:\n${formatContext(ctx)}`,
  }
}

export const hook: ClooksHook = {
  meta: {
    name: "kitchen-sink",
    description: "Handler for every event — reference showing available context fields",
  },

  beforeHook(event) {
    // Lifecycle: runs before the matched event handler.
    // Call event.respond() with block or skip to short-circuit.
    // Available: event.type, event.input (full event context), event.meta (HookEventMeta)
  },

  afterHook(event) {
    // Lifecycle: runs after the handler completes.
    // Available: event.type, event.input, event.handlerResult, event.meta
    // Call event.respond() to override the handler's result.
  },

  // --- Guard events (can allow/block/skip) ---
  PreToolUse: (ctx) => ctx.skip(injectOpts("PreToolUse", ctx as any)),
  UserPromptSubmit: (ctx) => ctx.skip(injectOpts("UserPromptSubmit", ctx as any)),
  PermissionRequest: (ctx) => ctx.skip(debugOpts("PermissionRequest", ctx as any)),
  Stop: (ctx) => ctx.skip(debugOpts("Stop", ctx as any)),
  SubagentStop: (ctx) => ctx.skip(debugOpts("SubagentStop", ctx as any)),
  ConfigChange: (ctx) => ctx.skip(debugOpts("ConfigChange", ctx as any)),

  // --- Observe events (skip only, some support injectContext) ---
  SessionStart: (ctx) => ctx.skip(injectOpts("SessionStart", ctx as any)),
  PostToolUse: (ctx) => ctx.skip(injectOpts("PostToolUse", ctx as any)),
  PostToolUseFailure: (ctx) => ctx.skip(injectOpts("PostToolUseFailure", ctx as any)),
  Notification: (ctx) => ctx.skip(injectOpts("Notification", ctx as any)),
  SubagentStart: (ctx) => ctx.skip(injectOpts("SubagentStart", ctx as any)),
  SessionEnd: (ctx) => ctx.skip(debugOpts("SessionEnd", ctx as any)),
  InstructionsLoaded: (ctx) => ctx.skip(debugOpts("InstructionsLoaded", ctx as any)),
  WorktreeRemove: (ctx) => ctx.skip(debugOpts("WorktreeRemove", ctx as any)),
  PreCompact: (ctx) => ctx.skip(debugOpts("PreCompact", ctx as any)),

  // WorktreeCreate is special: its result type is SuccessResult | FailureResult
  // (no SkipResult). We return a SuccessResult with a placeholder path.
  WorktreeCreate: (ctx) =>
    ctx.success({
      path: ctx.cwd,
      debugMessage: `[kitchen-sink] WorktreeCreate context:\n${formatContext(ctx as any)}`,
    }),

  // --- Continuation events (continue/stop/skip) ---
  TeammateIdle: (ctx) =>
    ctx.skip({
      debugMessage: `[kitchen-sink] TeammateIdle context:\n${formatContext(ctx as any)}`,
    }),
  TaskCompleted: (ctx) =>
    ctx.skip({
      debugMessage: `[kitchen-sink] TaskCompleted context:\n${formatContext(ctx as any)}`,
    }),
}
