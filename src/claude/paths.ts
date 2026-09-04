/**
 * Claude Code data and credential locations
 *
 * Matches the directories ccusage and Claude Code itself use.
 * CLAUDE_CONFIG_DIR may be a single path or a comma-separated list.
 */

import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export function getClaudeConfigRoots(): string[] {
  const override = process.env.CLAUDE_CONFIG_DIR
  if (override && override.trim()) {
    return override
      .split(',')
      .map(part => part.trim())
      .filter(Boolean)
      .map(expandHome)
  }

  return [
    join(homedir(), '.config', 'claude'),
    join(homedir(), '.claude')
  ]
}

export function getClaudeProjectsDirs(): string[] {
  return getClaudeConfigRoots()
    .map(root => join(root, 'projects'))
    .filter(dir => existsSync(dir))
}

export function getClaudeCredentialsCandidates(): string[] {
  return getClaudeConfigRoots().map(root => join(root, '.credentials.json'))
}

export function findClaudeCredentialsPath(): string | null {
  for (const candidate of getClaudeCredentialsCandidates()) {
    if (existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

export function getPreferredClaudeConfigDir(): string {
  const roots = getClaudeConfigRoots()
  for (const root of roots) {
    if (existsSync(root)) {
      return root
    }
  }
  return roots[0] || join(homedir(), '.claude')
}

function expandHome(p: string): string {
  if (p === '~') return homedir()
  if (p.startsWith('~/') || p.startsWith('~\\')) {
    return join(homedir(), p.slice(2))
  }
  return p
}
