// Echoes the entire hook payload back into the conversation context.
// Only active when CLOOKS_DEBUG=true — otherwise skips via beforeHook.

import type { ClooksHook, BaseContext } from "./types"
import { appendFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"

const LOG_DIR = process.env.CLOOKS_LOGDIR || "/tmp/clooks-debug"
const LOG_FILE = join(LOG_DIR, "debug-events.log")

function dump(ctx: BaseContext): string {
  const { signal: _, ...rest } = ctx
  return JSON.stringify(rest, null, 2)
}

function logToFile(ctx: BaseContext): void {
  const ts = new Date().toISOString()
  const line = `[${ts}] ${ctx.event}: ${dump(ctx)}\n`
  try {
    mkdirSync(LOG_DIR, { recursive: true })
    appendFileSync(LOG_FILE, line)
  } catch {
    // best-effort — don't crash the hook
  }
}

/** For events that support injectContext. */
function injectPayload(ctx: BaseContext) {
  logToFile(ctx)
  return {
    result: "skip" as const,
    injectContext: dump(ctx),
    debugMessage: `debug-payload: injected ${ctx.event} payload`,
  }
}

/** For events that only support debugMessage. */
function debugPayload(ctx: BaseContext) {
  logToFile(ctx)
  return {
    result: "skip" as const,
    debugMessage: `debug-payload [${ctx.event}]: ${dump(ctx)}`,
  }
}

export const hook: ClooksHook = {
  meta: {
    name: "debug-payload",
    description:
      "Echoes hook payload into conversation context when CLOOKS_DEBUG=true",
  },

  beforeHook(event) {
    if (process.env.CLOOKS_DEBUG !== "true") {
      event.respond({ result: "skip" })
    }
  },

  // --- Guard events (injectContext supported on PreToolUse, UserPromptSubmit) ---
  PreToolUse: (ctx) => injectPayload(ctx),
  UserPromptSubmit: (ctx) => injectPayload(ctx),
  PermissionRequest: (ctx) => debugPayload(ctx),
  Stop: (ctx) => debugPayload(ctx),
  SubagentStop: (ctx) => debugPayload(ctx),
  ConfigChange: (ctx) => debugPayload(ctx),

  // --- Observe events (injectContext supported on most) ---
  SessionStart: (ctx) => injectPayload(ctx),
  PostToolUse: (ctx) => injectPayload(ctx),
  PostToolUseFailure: (ctx) => injectPayload(ctx),
  Notification: (ctx) => injectPayload(ctx),
  SubagentStart: (ctx) => injectPayload(ctx),

  // Observe events without injectContext
  SessionEnd: (ctx) => debugPayload(ctx),
  InstructionsLoaded: (ctx) => debugPayload(ctx),
  WorktreeRemove: (ctx) => debugPayload(ctx),
  PreCompact: (ctx) => debugPayload(ctx),

  // --- Continuation events (debugMessage only) ---
  // WorktreeCreate is intentionally excluded: its result type is
  // SuccessResult | FailureResult (no SkipResult variant), which is
  // incompatible with this hook's skip-based pattern.
  TeammateIdle: (ctx) => debugPayload(ctx),
  TaskCompleted: (ctx) => debugPayload(ctx),
}
