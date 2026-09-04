/**
 * Claude Code credential discovery
 *
 * Reads ~/.claude/.credentials.json (or CLAUDE_CONFIG_DIR) and env vars.
 * Does not invent a Google-style browser OAuth flow — Claude Code already owns login.
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { debug } from '../core/logger.js'
import type { AuthSource, StoredTokens } from '../quota/types.js'
import { findClaudeCredentialsPath, getClaudeCredentialsCandidates } from './paths.js'

export interface ClaudeAiOauth {
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
  scopes?: string[]
  subscriptionType?: string
  rateLimitTier?: string
  [key: string]: unknown
}

export interface ClaudeCredentialsFile {
  claudeAiOauth?: ClaudeAiOauth
  [key: string]: unknown
}

export interface DiscoveredCredentials {
  source: AuthSource
  accessToken: string
  refreshToken?: string
  expiresAt: number
  apiKey?: string
  subscriptionType?: string
  rateLimitTier?: string
  credentialsPath?: string
  rawFile?: ClaudeCredentialsFile
}

/**
 * Normalize expiresAt that may be seconds or milliseconds
 */
export function normalizeExpiresAt(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) {
    return 0
  }
  // Values below 1e11 are epoch seconds
  return value < 1e11 ? value * 1000 : value
}

/** Claude Code's .credentials.json stores expiresAt in epoch seconds. */
export function toClaudeCodeExpiresAt(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return value
  }
  return value < 1e11 ? Math.floor(value) : Math.floor(value / 1000)
}

export function loadClaudeCredentialsFile(path: string): ClaudeCredentialsFile | null {
  if (!existsSync(path)) {
    return null
  }

  try {
    const content = readFileSync(path, 'utf-8')
    return JSON.parse(content) as ClaudeCredentialsFile
  } catch (err) {
    debug('credentials', `Failed to parse ${path}`, err)
    return null
  }
}

export function discoverClaudeCodeCredentials(): DiscoveredCredentials | null {
  const envOAuth = process.env.CLAUDE_CODE_OAUTH_TOKEN
  if (envOAuth && envOAuth.trim()) {
    return {
      source: 'oauth-token',
      accessToken: envOAuth.trim(),
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000
    }
  }

  const envKey = process.env.ANTHROPIC_API_KEY
  if (envKey && envKey.trim()) {
    return {
      source: 'api-key',
      accessToken: envKey.trim(),
      apiKey: envKey.trim(),
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000
    } as DiscoveredCredentials
  }

  const path = findClaudeCredentialsPath()
  if (!path) {
    debug('credentials', `No credentials file in ${getClaudeCredentialsCandidates().join(', ')}`)
    return null
  }

  const file = loadClaudeCredentialsFile(path)
  const oauth = file?.claudeAiOauth
  if (!oauth?.accessToken && !oauth?.refreshToken) {
    debug('credentials', `Credentials file at ${path} has no claudeAiOauth tokens`)
    return null
  }

  return {
    source: 'claude-code',
    accessToken: oauth.accessToken || '',
    refreshToken: oauth.refreshToken,
    expiresAt: normalizeExpiresAt(oauth.expiresAt),
    subscriptionType: oauth.subscriptionType,
    rateLimitTier: oauth.rateLimitTier,
    credentialsPath: path,
    rawFile: file || undefined
  }
}

export function hasClaudeCodeCredentials(): boolean {
  return discoverClaudeCodeCredentials() !== null
}

export function discoveredToStoredTokens(
  discovered: DiscoveredCredentials,
  email: string
): StoredTokens {
  return {
    accessToken: discovered.accessToken,
    refreshToken: discovered.refreshToken || '',
    expiresAt: discovered.expiresAt || Date.now(),
    email,
    source: discovered.source,
    apiKey: discovered.source === 'api-key' ? discovered.accessToken : undefined,
    subscriptionType: discovered.subscriptionType,
    rateLimitTier: discovered.rateLimitTier,
    credentialsPath: discovered.credentialsPath
  }
}

/**
 * Write rotated OAuth tokens back to Claude Code's credentials file.
 * Preserves unknown fields so Claude Code keeps working.
 */
export function writeClaudeCodeTokens(
  credentialsPath: string,
  tokens: { accessToken: string; refreshToken?: string; expiresAt: number }
): void {
  const existing = loadClaudeCredentialsFile(credentialsPath) || {}
  const previous = existing.claudeAiOauth || {}

  const next: ClaudeCredentialsFile = {
    ...existing,
    claudeAiOauth: {
      ...previous,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken || previous.refreshToken,
      expiresAt: toClaudeCodeExpiresAt(tokens.expiresAt)
    }
  }

  const dir = dirname(credentialsPath)
  const tmp = join(dir, `.credentials.json.${process.pid}.tmp`)
  writeFileSync(tmp, JSON.stringify(next, null, 2), { mode: 0o600 })
  renameSync(tmp, credentialsPath)
  debug('credentials', `Wrote rotated tokens to ${credentialsPath}`)
}

export function defaultAccountId(discovered: DiscoveredCredentials): string {
  if (discovered.source === 'api-key') {
    return 'api-key'
  }
  if (discovered.subscriptionType) {
    return `claude-code:${discovered.subscriptionType}`
  }
  return 'claude-code'
}
