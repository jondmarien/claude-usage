import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  normalizeExpiresAt,
  toClaudeCodeExpiresAt,
  loadClaudeCredentialsFile,
  writeClaudeCodeTokens,
  discoveredToStoredTokens,
  defaultAccountId
} from '../../src/claude/credentials.js'
import type { DiscoveredCredentials } from '../../src/claude/credentials.js'

describe('normalizeExpiresAt', () => {
  it('treats small values as seconds', () => {
    expect(normalizeExpiresAt(1_700_000_000)).toBe(1_700_000_000_000)
  })

  it('keeps millisecond timestamps', () => {
    expect(normalizeExpiresAt(1_700_000_000_000)).toBe(1_700_000_000_000)
  })

  it('returns 0 for missing values', () => {
    expect(normalizeExpiresAt(undefined)).toBe(0)
  })

  it('writes Claude Code expiresAt as epoch seconds', () => {
    expect(toClaudeCodeExpiresAt(1_700_000_000_000)).toBe(1_700_000_000)
    expect(toClaudeCodeExpiresAt(1_700_000_000)).toBe(1_700_000_000)
  })
})

describe('Claude credentials file', () => {
  let dir: string
  let path: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'claude-usage-creds-'))
    path = join(dir, '.credentials.json')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('round-trips oauth fields and preserves extras', () => {
    writeFileSync(path, JSON.stringify({
      claudeAiOauth: {
        accessToken: 'old',
        refreshToken: 'refresh',
        expiresAt: 1,
        subscriptionType: 'max',
        extraField: 'keep-me'
      },
      other: true
    }))

    writeClaudeCodeTokens(path, {
      accessToken: 'new',
      refreshToken: 'refresh-2',
      expiresAt: 99
    })

    const loaded = loadClaudeCredentialsFile(path)
    expect(loaded?.claudeAiOauth?.accessToken).toBe('new')
    expect(loaded?.claudeAiOauth?.refreshToken).toBe('refresh-2')
    expect(loaded?.claudeAiOauth?.extraField).toBe('keep-me')
    expect(loaded?.other).toBe(true)
    expect(loaded?.claudeAiOauth?.expiresAt).toBe(99)
    JSON.parse(readFileSync(path, 'utf-8'))
  })

  it('converts millisecond expiresAt to seconds on write-back', () => {
    writeClaudeCodeTokens(path, {
      accessToken: 'new',
      refreshToken: 'refresh-2',
      expiresAt: 1_700_000_000_000
    })
    const loaded = loadClaudeCredentialsFile(path)
    expect(loaded?.claudeAiOauth?.expiresAt).toBe(1_700_000_000)
  })
})

describe('discoveredToStoredTokens', () => {
  it('maps claude-code credentials', () => {
    const discovered: DiscoveredCredentials = {
      source: 'claude-code',
      accessToken: 'atok',
      refreshToken: 'rtok',
      expiresAt: 123,
      subscriptionType: 'pro',
      credentialsPath: '/tmp/.credentials.json'
    }
    const stored = discoveredToStoredTokens(discovered, 'user@example.com')
    expect(stored.email).toBe('user@example.com')
    expect(stored.source).toBe('claude-code')
    expect(stored.refreshToken).toBe('rtok')
    expect(stored.credentialsPath).toBe('/tmp/.credentials.json')
  })

  it('defaults account ids', () => {
    expect(defaultAccountId({ source: 'api-key', accessToken: 'k', expiresAt: 1 })).toBe('api-key')
    expect(defaultAccountId({ source: 'claude-code', accessToken: 'k', expiresAt: 1, subscriptionType: 'max' })).toBe('claude-code:max')
    expect(defaultAccountId({ source: 'oauth-token', accessToken: 'k', expiresAt: 1 })).toBe('claude-code')
  })
})
