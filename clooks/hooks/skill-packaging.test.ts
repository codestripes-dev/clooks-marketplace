import { expect, test } from 'bun:test'
import { cpSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'

const plugin = resolve(import.meta.dir, '..')

function skills(root: string) {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const path = join(root, entry.name, 'SKILL.md')
      expect(lstatSync(path).isFile()).toBe(true)
      const text = readFileSync(path, 'utf8')
      const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)
      expect(frontmatter).not.toBeNull()
      const metadata = Bun.YAML.parse(frontmatter![1]!) as { name: string; description: string }
      expect(metadata.description.trim().length).toBeGreaterThan(0)
      return { directory: entry.name, path, text, name: metadata.name }
    })
}

test('both agents expose setup and create-hook from a relocated plugin', () => {
  const root = mkdtempSync(join(tmpdir(), 'clooks skill cache '))
  try {
    const cache = join(root, 'marketplace/clooks/0.3.0')
    cpSync(plugin, cache, { recursive: true })
    const manifest = JSON.parse(readFileSync(join(cache, '.codex-plugin/plugin.json'), 'utf8'))
    const claude = skills(join(cache, 'skills'))
    const codex = skills(resolve(cache, manifest.skills))
    expect(claude.map((skill) => skill.directory).sort()).toEqual(['create-hook', 'setup'])
    expect(codex.map((skill) => skill.directory).sort()).toEqual(['create-hook', 'setup'])
    for (const skill of codex) expect(skill.name).toBe(skill.directory)

    const authoring = codex.find((skill) => skill.name === 'create-hook')!
    const references = [...authoring.text.matchAll(/\[[^\]]+\]\(([^)]+\.md)\)/g)]
    expect(references).toHaveLength(1)
    const guide = resolve(dirname(authoring.path), references[0]![1]!)
    expect(relative(cache, guide).startsWith('..')).toBe(false)
    expect(guide).toBe(claude.find((skill) => skill.directory === 'create-hook')!.path)
    expect(lstatSync(guide).isFile()).toBe(true)
    expect(readFileSync(guide, 'utf8')).toBe(readFileSync(join(plugin, 'skills/create-hook/SKILL.md'), 'utf8'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
