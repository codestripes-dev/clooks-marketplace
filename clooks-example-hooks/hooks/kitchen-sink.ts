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
    .map(([k, v]) => `  ${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join("\n")
}

function withInject(event: string, ctx: Record<string, unknown>) {
  return {
    result: "skip" as const,
    injectContext: `[kitchen-sink] ${event} context:\n${formatContext(ctx)}`,
    debugMessage: `kitchen-sink: ${event}`,
  }
}

function withDebug(event: string, ctx: Record<string, unknown>) {
  return {
    result: "skip" as const,
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
  PreToolUse: (ctx) => withInject("PreToolUse", ctx),
  UserPromptSubmit: (ctx) => withInject("UserPromptSubmit", ctx),
  PermissionRequest: (ctx) => withDebug("PermissionRequest", ctx),
  Stop: (ctx) => withDebug("Stop", ctx),
  SubagentStop: (ctx) => withDebug("SubagentStop", ctx),
  ConfigChange: (ctx) => withDebug("ConfigChange", ctx),

  // --- Observe events (skip only, some support injectContext) ---
  SessionStart: (ctx) => withInject("SessionStart", ctx),
  PostToolUse: (ctx) => withInject("PostToolUse", ctx),
  PostToolUseFailure: (ctx) => withInject("PostToolUseFailure", ctx),
  Notification: (ctx) => withInject("Notification", ctx),
  SubagentStart: (ctx) => withInject("SubagentStart", ctx),
  SessionEnd: (ctx) => withDebug("SessionEnd", ctx),
  InstructionsLoaded: (ctx) => withDebug("InstructionsLoaded", ctx),
  WorktreeRemove: (ctx) => withDebug("WorktreeRemove", ctx),
  PreCompact: (ctx) => withDebug("PreCompact", ctx),

  // WorktreeCreate is special: its result type is SuccessResult | FailureResult
  // (no SkipResult). We return a SuccessResult with a placeholder path.
  WorktreeCreate: (ctx) => ({
    result: "success" as const,
    path: ctx.cwd,
    debugMessage: `[kitchen-sink] WorktreeCreate context:\n${formatContext(ctx as any)}`,
  }),

  // --- Continuation events (continue/stop/skip) ---
  TeammateIdle: (ctx) => ({
    result: "skip" as const,
    debugMessage: `[kitchen-sink] TeammateIdle context:\n${formatContext(ctx as any)}`,
  }),
  TaskCompleted: (ctx) => ({
    result: "skip" as const,
    debugMessage: `[kitchen-sink] TaskCompleted context:\n${formatContext(ctx as any)}`,
  }),
}
