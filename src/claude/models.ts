/**
 * Claude / Claude Code model defaults
 *
 * IDs verified against Anthropic's Sep 2026 models overview:
 * https://platform.claude.com/docs/en/about-claude/models/overview
 *
 * Current API aliases:
 *   claude-haiku-4-5  → claude-haiku-4-5-20251001
 *   claude-sonnet-5
 *   claude-opus-5
 *
 * Claude Code accepts the same IDs (`claude --model claude-sonnet-5`).
 */

export const DEFAULT_WAKEUP_MODELS = [
  'claude-haiku-4-5',
  'claude-sonnet-5'
] as const

export const CLAUDE_MODEL_OPTIONS = [
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5 (cheapest wakeup)' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5 (current Claude default)' },
  { id: 'claude-opus-5', label: 'Opus 5 (Opus weekly window)' }
] as const

/** Older IDs that should be rewritten to the current generation. */
const OUTDATED_CLAUDE_MODELS: Record<string, string> = {
  'claude-sonnet-4-5': 'claude-sonnet-5',
  'claude-sonnet-4-5-20250929': 'claude-sonnet-5',
  'claude-opus-4-1': 'claude-opus-5',
  'claude-opus-4-5': 'claude-opus-5',
  'claude-opus-4-6': 'claude-opus-5',
  'claude-opus-4-7': 'claude-opus-5',
  'claude-opus-4-8': 'claude-opus-5'
}

export const CLAUDE_CODE_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'
export const CLAUDE_OAUTH_BETA = 'oauth-2025-04-20'
export const ANTHROPIC_VERSION = '2023-06-01'

export const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
export const PROFILE_URL = 'https://api.anthropic.com/api/oauth/profile'
export const TOKEN_URL = 'https://platform.claude.com/v1/oauth/token'
export const MESSAGES_URL = 'https://api.anthropic.com/v1/messages'

export function isLegacyAntigravityModel(modelId: string): boolean {
  const id = modelId.toLowerCase()
  return id.includes('gemini') || id.includes('antigravity')
}

export function isOutdatedClaudeModel(modelId: string): boolean {
  return Object.prototype.hasOwnProperty.call(OUTDATED_CLAUDE_MODELS, modelId)
}

export function migrateWakeupModels(models: string[]): string[] {
  const next = models
    .filter(id => !isLegacyAntigravityModel(id))
    .map(id => OUTDATED_CLAUDE_MODELS[id] || id)

  if (next.length === 0) {
    return [...DEFAULT_WAKEUP_MODELS]
  }

  return [...new Set(next)]
}
