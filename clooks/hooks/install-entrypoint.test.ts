import { describe, expect, test } from 'bun:test'
import {
  chmodSync, copyFileSync, lstatSync, mkdirSync, mkdtempSync,
  readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const bash = Bun.which('bash')!
const cat = Bun.which('cat')!
const source = join(import.meta.dir, 'install-entrypoint.sh')

function snapshot(root: string): unknown[] {
  return readdirSync(root).sort().map((name) => {
    const path = join(root, name)
    const stat = lstatSync(path)
    const content = stat.isSymbolicLink() ? readlinkSync(path)
      : stat.isDirectory() ? snapshot(path) : readFileSync(path).toString('base64')
    return [name, stat.mode, stat.mtimeMs, content]
  })
}

type State = 'absent' | 'path' | 'managed' | 'both' | 'nonexec-path' | 'nonexec-managed' | 'directory'

function run(state: State, agent?: string, skip?: string) {
  const root = mkdtempSync('/tmp/clooks reminder ')
  try {
    const home = join(root, 'home with spaces')
    const bin = join(root, 'path with spaces')
    const managed = join(home, '.local/bin')
    const cache = join(root, 'cache with spaces/clooks/0.3.0/hooks')
    const project = join(root, 'project with spaces')
    for (const dir of [home, bin, managed, cache, project]) mkdirSync(dir, { recursive: true })
    for (const name of ['.bashrc', '.zshrc', '.bash_profile']) {
      writeFileSync(join(home, name), '# unchanged fixture\n')
    }
    const script = join(cache, 'install-entrypoint.sh')
    copyFileSync(source, script)
    symlinkSync(cat, join(bin, 'cat'))

    // Any runtime, installer, downloader, or consent command must fail visibly.
    const spy = '#!' + bash + '\nprintf "executed\\n" >> "$HOME/executed"\nexit 97\n'
    for (const name of ['curl', 'wget', 'install', 'clooks:setup', 'osascript', 'zenity']) {
      writeFileSync(join(bin, name), spy, { mode: 0o755 })
    }
    if (['path', 'both', 'nonexec-path'].includes(state)) {
      writeFileSync(join(bin, 'clooks'), spy, { mode: 0o755 })
      if (state === 'nonexec-path') chmodSync(join(bin, 'clooks'), 0o644)
    }
    if (['managed', 'both', 'nonexec-managed'].includes(state)) {
      writeFileSync(join(managed, 'clooks'), spy, { mode: 0o755 })
      if (state === 'nonexec-managed') chmodSync(join(managed, 'clooks'), 0o644)
    }
    if (state === 'directory') mkdirSync(join(managed, 'clooks'))

    const before = snapshot(root)
    const env: Record<string, string> = {
      HOME: home, PATH: bin, TMPDIR: root,
      // Deliberately present for Codex too: this must not select the provider.
      CLAUDE_PLUGIN_ROOT: join(cache, '..'),
    }
    if (agent !== undefined) env.CLOOKS_AGENT = agent
    if (skip !== undefined) env.SKIP_CLOOKS = skip
    // Verify delivery first, then check that even silent branches drain stdin.
    const result = spawnSync(bash, ['--noprofile', '--norc', '-c',
      'IFS= read -r header; [ "$header" = delivered ] || exit 92; "$1" --noprofile --norc "$2"; status=$?; if IFS= read -r remaining; then exit 91; fi; exit "$status"',
      'drain-check', bash, script], {
      cwd: project, env, input: 'delivered\n' + JSON.stringify({ payload: 'x'.repeat(256 * 1024) }) + '\n',
      encoding: 'utf8', timeout: 5000,
    })
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(snapshot(root)).toEqual(before)
    return result.stdout
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('read-only plugin bootstrap reminder', () => {
  for (const agent of [undefined, '', 'claude', 'codex', 'unknown"agent']) {
    const setup = agent === 'codex' ? '$clooks:setup' : '/clooks:setup'
    for (const state of ['absent', 'managed', 'nonexec-path', 'nonexec-managed', 'directory'] as const) {
      test(`${String(agent)}: ${state} emits accurate, explicit-only JSON`, () => {
        const output = JSON.parse(run(state, agent))
        expect(Object.keys(output).sort()).toEqual(['hookSpecificOutput', 'systemMessage'])
        expect(Object.keys(output.hookSpecificOutput).sort()).toEqual(['additionalContext', 'hookEventName'])
        expect(output.hookSpecificOutput.hookEventName).toBe('SessionStart')
        expect(output.systemMessage).toContain(setup)
        expect(output.hookSpecificOutput.additionalContext).toContain(setup)
        expect(output.hookSpecificOutput.additionalContext).toContain('Wait for the user to explicitly invoke setup.')
        expect(output.hookSpecificOutput.additionalContext).toContain('do not run setup, install, update, initialize, or request startup consent automatically')
        if (state === 'managed') {
          expect(output.systemMessage).toContain("installed at ~/.local/bin/clooks but unavailable on this agent's PATH")
          expect(output.systemMessage).toContain(`${setup} check`)
          expect(output.systemMessage).toContain('Add ~/.local/bin to PATH and relaunch the agent if needed.')
          expect(output.hookSpecificOutput.additionalContext).toContain("does not repair the running agent's environment")
        } else {
          expect(output.systemMessage).toContain('No executable runtime found')
          expect(output.systemMessage).not.toContain('relaunch')
        }
      })
    }
    for (const state of ['path', 'both'] as const) {
      test(`${String(agent)}: ${state} stays silent without running binaries`, () => {
        expect(run(state, agent)).toBe('')
      })
    }
  }

  test.each(['absent', 'managed', 'path'] as const)('SKIP_CLOOKS=true drains stdin in %s state', (state) => {
    expect(run(state, 'codex', 'true')).toBe('')
  })

  test.each(['', 'false', 'TRUE'])('SKIP_CLOOKS=%s does not bypass the reminder', (skip) => {
    expect(JSON.parse(run('absent', 'codex', skip)).systemMessage).toContain('$clooks:setup')
  })
})
