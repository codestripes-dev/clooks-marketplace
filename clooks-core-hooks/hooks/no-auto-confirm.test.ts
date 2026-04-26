import { describe, expect, test } from 'bun:test'
import type { PreToolUseContext } from './types'
import {
  hook,
  sanitize,
  getSegments,
  stripEnvPrefix,
  isAutoConfirm,
} from './no-auto-confirm'

// --- Helpers ---

function makeCtx(command: string, toolName = 'Bash'): PreToolUseContext {
  return {
    event: 'PreToolUse',
    toolName,
    toolInput: { command },
    originalToolInput: { command },
    toolUseId: 'tu-test',
    sessionId: 'test-session',
    cwd: '/tmp',
    permissionMode: 'default',
    transcriptPath: '/tmp/transcript.jsonl',
    allow: (opts = {}) => ({ result: 'allow', ...opts }),
    block: (opts) => ({ result: 'block', ...opts }),
    skip: (opts = {}) => ({ result: 'skip', ...opts }),
    ask: (opts) => ({ result: 'ask', ...opts }),
    defer: (opts = {}) => ({ result: 'defer', ...opts }),
  } as PreToolUseContext
}

const DEFAULT_CONFIG = {}

// =============================================================================
// Section 1: Utility function tests
// =============================================================================

describe('sanitize', () => {
  test.each([
    ['strips single-quoted strings', "echo 'yes | foo' bar", 'echo  bar'],
    ['strips double-quoted strings', 'echo "yes | foo" bar', 'echo  bar'],
    ['strips comments', 'yes | foo # auto-confirm', 'yes | foo '],
    ['strips all three', `echo 'a' "b" # c`, 'echo   '],
    ['preserves unquoted content', 'yes | rm -rf /tmp', 'yes | rm -rf /tmp'],
  ])('%s', (_label, input, expected) => {
    expect(sanitize(input)).toBe(expected)
  })
})

describe('getSegments', () => {
  test.each([
    ['splits on &&', 'a && b', ['a', 'b']],
    ['splits on ||', 'a || b', ['a', 'b']],
    ['splits on ;', 'a ; b', ['a', 'b']],
    ['handles mixed operators', 'a && b || c ; d', ['a', 'b', 'c', 'd']],
    ['filters empty segments', ' && ', []],
    ['single segment', 'yes | command', ['yes | command']],
  ])('%s', (_label, input, expected) => {
    expect(getSegments(input)).toEqual(expected)
  })
})

describe('stripEnvPrefix', () => {
  test.each([
    ['no prefix', 'yes | command', 'yes | command'],
    ['single prefix', 'NPM_TOKEN=xxx yes | command', 'yes | command'],
    ['multiple prefixes', 'A=1 B=2 yes | command', 'yes | command'],
    ['leading whitespace', '  yes | command', 'yes | command'],
    ['prefix + whitespace', '  VAR=val yes | command', 'yes | command'],
    ['empty string', '', ''],
    ['whitespace only', '   ', ''],
  ])('%s', (_label, input, expected) => {
    expect(stripEnvPrefix(input)).toBe(expected)
  })
})

describe('isAutoConfirm', () => {
  // --- yes patterns ---
  test.each([
    ['yes |', 'yes | rm -rf /tmp', true],
    ['yes | (no space before pipe)', 'yes| command', true],
    ['yes with custom word', 'yes sure | command', true],
    ['yes with full path', '/usr/bin/yes | command', true],
    ['yes with relative path', './yes | command', true],
    ['yes with homebrew path', '/opt/homebrew/bin/yes | command', true],
    ['yes standalone (no pipe)', 'yes', false],
    ['yes with arg (no pipe)', 'yes sure', false],
    ['YES | (false-positive: uppercase command — not a valid Linux binary)', 'YES | command', false],
    ['\\yes | (known limitation: backslash escape bypasses hook)', '\\yes | command', false],
    ['yes with two arguments (known limitation: regex handles one arg)', 'yes sure thing | command', false],
  ])('yes: %s → %s', (_label, input, expected) => {
    expect(isAutoConfirm(input)).toBe(expected)
  })

  // --- echo patterns ---
  test.each([
    ['echo y |', 'echo y | apt install foo', true],
    ['echo Y | (uppercase)', 'echo Y | command', true],
    ['echo yes |', 'echo yes | dangerous-cmd', true],
    ['echo YES | (uppercase)', 'echo YES | command', true],
    ['echo Yes | (mixed case)', 'echo Yes | command', true],
    ['echo -e y |', 'echo -e y | command', true],
    ['echo -e yes |', 'echo -e YES | command', true],
    ['echo -n y |', 'echo -n y | command', true],
    ['echo -n yes |', 'echo -n yes | command', true],
    ['echo -ne y |', 'echo -ne y | command', true],
    ['echo -en y |', 'echo -en y | command', true],
    ['echo -E y |', 'echo -E y | command', true],
    ['echo -E yes |', 'echo -E yes | command', true],
    ['echo -nE y |', 'echo -nE y | command', true],
    ['echo -En y |', 'echo -En y | command', true],
    ['echo y| (no space before pipe)', 'echo y| command', true],
    ['echo hello | (false-positive: not a confirm token)', 'echo hello | command', false],
    ['echo yesterday | (false-positive: starts with y but not a token)', 'echo yesterday | command', false],
    ['echo ye | (false-positive: partial token)', 'echo ye | command', false],
    ['echo (no arg)', 'echo | command', false],
    ['echo with redirect (not a pipe)', 'echo y > file', false],
    ['echo -nne y | (repeated flag chars — regression test)', 'echo -nne y | command', true],
    ['echo -een yes | (repeated flag chars)', 'echo -een yes | command', true],
    ['echo -e -n y | (known limitation: two separate flag tokens)', 'echo -e -n y | command', false],
    ['echo -n -e yes | (known limitation: two separate flag tokens)', 'echo -n -e yes | command', false],
  ])('echo: %s → %s', (_label, input, expected) => {
    expect(isAutoConfirm(input)).toBe(expected)
  })

  // --- printf patterns ---
  test.each([
    ['printf y |', 'printf y | command', true],
    ['printf Y | (uppercase)', 'printf Y | command', true],
    ['printf yes |', 'printf yes | command', true],
    ['printf YES | (uppercase)', 'printf YES | command', true],
    ['printf hello | (false-positive: not a token)', 'printf hello | command', false],
    ['printf (no arg)', 'printf | command', false],
  ])('printf: %s → %s', (_label, input, expected) => {
    expect(isAutoConfirm(input)).toBe(expected)
  })

  // --- Not blocked ---
  test.each([
    ['true | command', 'true | command', false],
    ['cat file | grep', 'cat file | grep pattern', false],
    ['command with no pipe', 'apt install -y foo', false],
  ])('not blocked: %s → %s', (_label, input, expected) => {
    expect(isAutoConfirm(input)).toBe(expected)
  })
})

// =============================================================================
// Section 2: hook.PreToolUse — skip conditions
// =============================================================================

describe('hook.PreToolUse — skip conditions', () => {
  test('skips non-Bash tools', () => {
    const result = hook.PreToolUse!(makeCtx('yes | command', 'Read'), DEFAULT_CONFIG)
    expect(result.result).toBe('skip')
  })

  test('skips empty command', () => {
    const result = hook.PreToolUse!(makeCtx(''), DEFAULT_CONFIG)
    expect(result.result).toBe('skip')
  })

  test('skips non-string command', () => {
    const ctx = makeCtx('')
    ctx.toolInput = { command: 123 as any }
    const result = hook.PreToolUse!(ctx, DEFAULT_CONFIG)
    expect(result.result).toBe('skip')
  })
})

// =============================================================================
// Section 3: hook.PreToolUse — true positives
// =============================================================================

describe('hook.PreToolUse — true positives', () => {
  test.each([
    ['yes |', 'yes | rm -rf /tmp'],
    ['yes with custom word', 'yes sure | command'],
    ['echo y |', 'echo y | apt install foo'],
    ['echo YES | (case-insensitive)', 'echo YES | dangerous-cmd'],
    ['echo -e y |', 'echo -e y | command'],
    ['echo -n y |', 'echo -n y | command'],
    ['echo -ne y |', 'echo -ne y | command'],
    ['echo -en y |', 'echo -en y | command'],
    ['printf y |', 'printf y | command'],
    ['printf YES |', 'printf YES | command'],
    ['/usr/bin/yes |', '/usr/bin/yes | command'],
    ['compound: cd && yes |', 'cd /tmp && yes | rm -rf *'],
    ['compound: cmd ; echo y |', 'ls ; echo y | command'],
    ['env var prefix', 'NPM_TOKEN=xxx yes | command'],
    ['multiple env vars', 'A=1 B=2 echo y | command'],
    ['leading whitespace', '  yes | command'],
  ])('blocks %s', (_label, command) => {
    const result = hook.PreToolUse!(makeCtx(command), DEFAULT_CONFIG) as any
    expect(result.result).toBe('block')
    expect(result.reason).toContain('non-interactive mode')
    expect(result.reason).toContain('-y, --yes, --force')
  })
})

// =============================================================================
// Section 4: hook.PreToolUse — true negatives
// =============================================================================

describe('hook.PreToolUse — true negatives', () => {
  test.each([
    ['true | command (legitimate pipe)', 'true | command'],
    ['echo hello | command (false-positive: not a confirm token)', 'echo hello | command'],
    ['yes standalone (no pipe)', 'yes'],
    ['echo yesterday | (false-positive: starts with y)', 'echo yesterday | command'],
    ['echo ye | (false-positive: partial token)', 'echo ye | command'],
    ['quoted: echo \'yes | ...\'', "echo 'yes | something'"],
    ['quoted: echo "y" | (sanitized away)', 'echo "y" | command'],
    ['cat file | grep (not auto-confirm)', 'cat file | grep pattern'],
    ['apt install -y (using designed flag)', 'apt install -y foo'],
    ['printf with quoted arg (known limitation: sanitization trade-off)', "printf 'y\\n' | apt install foo"],
    ['command with no pipe at all', 'rm -rf /tmp'],
  ])('allows %s', (_label, command) => {
    const result = hook.PreToolUse!(makeCtx(command), DEFAULT_CONFIG)
    expect(result.result).toBe('skip')
  })
})

// =============================================================================
// Section 5: Edge cases
// =============================================================================

describe('hook.PreToolUse — edge cases', () => {
  test('block message matches FEAT-0053 spec', () => {
    const result = hook.PreToolUse!(makeCtx('yes | command'), DEFAULT_CONFIG) as any
    expect(result.reason).toBe(
      'Piping auto-responses (yes, echo, printf) into a command simulates human input ' +
      "instead of using the command's non-interactive mode. Use the command's own flag " +
      '(e.g. -y, --yes, --force, --non-interactive, -auto-approve) or ask the user to ' +
      'run the command interactively.'
    )
  })

  test('debugMessage includes the original command', () => {
    const result = hook.PreToolUse!(makeCtx('yes | rm -rf /tmp'), DEFAULT_CONFIG) as any
    expect(result.debugMessage).toContain('yes | rm -rf /tmp')
  })

  test('debugMessage includes original command for echo pattern', () => {
    const result = hook.PreToolUse!(makeCtx('echo y | apt install foo'), DEFAULT_CONFIG) as any
    expect(result.debugMessage).toContain('echo y | apt install foo')
  })

  test('debugMessage includes original command for printf pattern', () => {
    const result = hook.PreToolUse!(makeCtx('printf yes | command'), DEFAULT_CONFIG) as any
    expect(result.debugMessage).toContain('printf yes | command')
  })

  test('only first matching segment triggers block', () => {
    // Both segments match, but block fires on the first
    const result = hook.PreToolUse!(makeCtx('yes | cmd1 && echo y | cmd2'), DEFAULT_CONFIG) as any
    expect(result.result).toBe('block')
  })

  test('second segment match after innocent first segment', () => {
    const result = hook.PreToolUse!(makeCtx('ls -la && yes | command'), DEFAULT_CONFIG) as any
    expect(result.result).toBe('block')
  })

  test('sanitization removes quoted auto-confirm from all segments', () => {
    // The yes | is inside quotes, so after sanitization it disappears
    const result = hook.PreToolUse!(makeCtx("echo 'yes | something' && ls"), DEFAULT_CONFIG)
    expect(result.result).toBe('skip')
  })

  test('compound with || operator: yes | cmd || fallback', () => {
    // Single | is kept within segment, || splits segments
    const result = hook.PreToolUse!(makeCtx('yes | rm -rf / || echo failed'), DEFAULT_CONFIG) as any
    expect(result.result).toBe('block')
  })

  test('sanitization: yes with quoted arg still blocks (arg stripped but yes| remains)', () => {
    // "yes 'confirm' | cmd" → after sanitization → "yes  | cmd" → still blocks
    const result = hook.PreToolUse!(makeCtx("yes 'confirm' | rm -rf /tmp"), DEFAULT_CONFIG) as any
    expect(result.result).toBe('block')
  })
})
