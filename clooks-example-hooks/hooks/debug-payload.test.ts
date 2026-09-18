import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { BaseContext } from './types'
import { hook } from './debug-payload'

let directory: string
let previousDebug: string | undefined
let previousLogDir: string | undefined
beforeEach(() => {
  previousDebug = process.env.CLOOKS_DEBUG
  previousLogDir = process.env.CLOOKS_LOGDIR
  directory = mkdtempSync(join(tmpdir(), 'clooks-debug-payload-'))
  process.env.CLOOKS_DEBUG = 'true'
  process.env.CLOOKS_LOGDIR = join(directory, 'logs')
})
afterEach(() => {
  if (previousDebug === undefined) delete process.env.CLOOKS_DEBUG
  else process.env.CLOOKS_DEBUG = previousDebug
  if (previousLogDir === undefined) delete process.env.CLOOKS_LOGDIR
  else process.env.CLOOKS_LOGDIR = previousLogDir
  rmSync(directory, { recursive: true, force: true })
})

type Options = { injectContext?: string; debugMessage?: string }
type Result = Options & { result: 'skip' }
const handlers = hook as unknown as Record<string, (ctx: BaseContext, config: {}) => Result>
function context(event: string): BaseContext {
  return {
    event,
    agent: 'codex',
    sessionId: 'test-session',
    cwd: directory,
    toolName: 'Bash',
    toolInput: { command: 'echo secret-marker' },
    signal: new AbortController().signal,
    skip: (opts: Options = {}) => ({ result: 'skip', ...opts }),
    allow: () => { throw new Error('Debugging must not allow') },
  } as unknown as BaseContext
}
function gate() {
  const event = {
    type: 'PreToolUse',
    input: context('PreToolUse'),
    meta: {},
    skip: () => ({ result: 'skip' }),
  }
  return hook.beforeHook!(event as unknown as Parameters<NonNullable<typeof hook.beforeHook>>[0], {})
}

describe('debug-payload', () => {
  test.each([undefined, '', 'false', 'TRUE', '1'])('gate skips for %s without serializing or writing', (value) => {
    if (value === undefined) delete process.env.CLOOKS_DEBUG
    else process.env.CLOOKS_DEBUG = value
    expect(gate()).toEqual({ result: 'skip' })
    expect(existsSync(join(directory, 'logs'))).toBe(false)
  })
  test('gate permits handler execution only for exact true', () => {
    expect(gate()).toBeUndefined()
  })

  test.each([
    'UserPromptSubmit',
    'SessionStart',
    'PostToolUse',
    'PostToolUseFailure',
    'Notification',
    'SubagentStart',
  ])('%s skips with serializable normalized context injection', (event) => {
    const result = handlers[event]!(context(event), {})
    expect(result.result).toBe('skip')
    const value = JSON.parse(result.injectContext!)
    expect(value.sessionId).toBe('test-session')
    expect(value.toolInput.command).toBe('echo secret-marker')
    expect(value.signal).toBeUndefined()
    expect(value.skip).toBeUndefined()
    expect(value.session_id).toBeUndefined()
    expect(readFileSync(join(directory, 'logs/debug-events.log'), 'utf8')).toContain('secret-marker')
  })

  test.each([
    'PreToolUse',
    'PermissionRequest',
    'Stop',
    'SubagentStop',
    'ConfigChange',
    'SessionEnd',
    'InstructionsLoaded',
    'WorktreeRemove',
    'PreCompact',
    'PostCompact',
    'TeammateIdle',
    'TaskCompleted',
  ])('%s remains debug-only skip', (event) => {
    const result = handlers[event]!(context(event), {})
    expect(Object.keys(result).sort()).toEqual(['debugMessage', 'result'])
    expect(result.result).toBe('skip')
    expect(result.debugMessage).toContain(`debug-payload [${event}]`)
    expect(result.debugMessage).toContain('secret-marker')
    expect(readFileSync(join(directory, 'logs/debug-events.log'), 'utf8')).toContain(event)
  })

  test('runtime directory override and append preserve both entries', () => {
    const ctx = context('SessionEnd')
    handlers.SessionEnd!(ctx, {})
    handlers.SessionEnd!(ctx, {})
    expect(readFileSync(join(directory, 'logs/debug-events.log'), 'utf8').match(/\] SessionEnd:/g)).toHaveLength(2)
    process.env.CLOOKS_LOGDIR = join(directory, 'other')
    handlers.SessionEnd!(ctx, {})
    expect(existsSync(join(directory, 'other/debug-events.log'))).toBe(true)
  })
  test('mkdir and append failures are best-effort for both output modes', () => {
    const occupied = join(directory, 'occupied')
    writeFileSync(occupied, 'unchanged')
    for (const target of [occupied, join(directory, 'logs')]) {
      process.env.CLOOKS_LOGDIR = target
      if (target !== occupied) {
        // A directory at the file path forces append failure without permissions tricks.
        mkdirSync(join(target, 'debug-events.log'), { recursive: true })
      }
      for (const event of ['SessionStart', 'PreToolUse', 'SessionEnd']) {
        expect(handlers[event]!(context(event), {}).result).toBe('skip')
      }
    }
    expect(readFileSync(occupied, 'utf8')).toBe('unchanged')
  })
  test('WorktreeCreate is intentionally absent', () => {
    expect(hook.WorktreeCreate).toBeUndefined()
  })
})
