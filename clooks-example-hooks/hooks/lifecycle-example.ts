// lifecycle-example — Demonstrates beforeHook, afterHook, and config
//
// - beforeHook: blocks Bash on configurable protected branches, records start time.
// - handler: allows all tool uses.
// - afterHook: logs handler duration.
//
// Note: The module-level phaseStartTime variable is not concurrency-safe.
// In parallel mode, interleaved invocations would overwrite each other's
// start times. This pattern is safe only for sequential hooks.

import type { ClooksHook } from "./types"

type Config = {
  protectedBranches: string[]
}

let phaseStartTime: number | undefined

export const hook: ClooksHook<Config> = {
  meta: {
    name: "lifecycle-example",
    description: "Example: environment gating + timing via lifecycle methods",
    config: {
      protectedBranches: ["production"],
    },
  },

  beforeHook(event, config) {
    phaseStartTime = performance.now()

    if (
      event.type === "PreToolUse" &&
      config.protectedBranches.includes(event.meta.gitBranch ?? "") &&
      event.input.toolName === "Bash"
    ) {
      return event.block({
        reason: "Bash commands are blocked on the production branch",
      })
    }
  },

  PreToolUse(ctx) {
    return ctx.allow()
  },

  afterHook(event) {
    if (phaseStartTime !== undefined) {
      const duration = performance.now() - phaseStartTime
      console.log(`[lifecycle-example] ${event.type} handler took ${duration.toFixed(1)}ms`)
      phaseStartTime = undefined
    }
  },
}
