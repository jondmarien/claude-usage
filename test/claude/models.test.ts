import { describe, it, expect } from 'vitest'
import {
  DEFAULT_WAKEUP_MODELS,
  CLAUDE_MODEL_OPTIONS,
  isLegacyAntigravityModel,
  isOutdatedClaudeModel,
  migrateWakeupModels,
  resolveAnthropicUrl,
  USAGE_URL
} from '../../src/claude/models.js'

describe('current Claude model IDs', () => {
  it('defaults to Haiku 4.5 and Sonnet 5', () => {
    expect([...DEFAULT_WAKEUP_MODELS]).toEqual(['claude-haiku-4-5', 'claude-sonnet-5'])
  })

  it('offers current Opus 5, not deprecated opus-4-1 or sonnet-4-5', () => {
    const ids = CLAUDE_MODEL_OPTIONS.map(option => option.id)
    expect(ids).toEqual(['claude-haiku-4-5', 'claude-sonnet-5', 'claude-opus-5'])
    expect(ids).not.toContain('claude-sonnet-4-5')
    expect(ids).not.toContain('claude-opus-4-1')
  })

  it('detects Antigravity/Gemini leftovers', () => {
    expect(isLegacyAntigravityModel('gemini-3-flash')).toBe(true)
    expect(isLegacyAntigravityModel('claude-sonnet-5')).toBe(false)
  })

  it('migrates outdated Claude IDs to the current generation', () => {
    expect(migrateWakeupModels(['claude-sonnet-4-5', 'claude-opus-4-1', 'gemini-3-flash']))
      .toEqual(['claude-sonnet-5', 'claude-opus-5'])
    expect(isOutdatedClaudeModel('claude-sonnet-4-5')).toBe(true)
    expect(isOutdatedClaudeModel('claude-sonnet-5')).toBe(false)
  })

  it('falls back to defaults when only leftover models remain', () => {
    expect(migrateWakeupModels(['gemini-3-pro-low'])).toEqual(['claude-haiku-4-5', 'claude-sonnet-5'])
  })

  it('rewrites Anthropic API URLs when ANTHROPIC_BASE_URL is set', () => {
    const previous = process.env.ANTHROPIC_BASE_URL
    process.env.ANTHROPIC_BASE_URL = 'https://proxy.example/anthropic/'
    try {
      expect(resolveAnthropicUrl(USAGE_URL)).toBe('https://proxy.example/anthropic/api/oauth/usage')
    } finally {
      if (previous === undefined) {
        delete process.env.ANTHROPIC_BASE_URL
      } else {
        process.env.ANTHROPIC_BASE_URL = previous
      }
    }
  })
})
