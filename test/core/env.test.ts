/**
 * Tests for environment utilities
 */

import { describe, it, expect } from 'vitest'
import { getPlatform, getConfigDir, getTokensPath, APP_NAME } from '../../src/core/env.js'

describe('getPlatform', () => {
  it('should return a valid platform', () => {
    const platform = getPlatform()
    expect(['windows', 'macos', 'linux']).toContain(platform)
  })
})

describe('getConfigDir', () => {
  it('should return a non-empty path', () => {
    const configDir = getConfigDir()
    expect(configDir).toBeTruthy()
    expect(configDir.length).toBeGreaterThan(0)
  })

  it('should include claude-usage in path', () => {
    const configDir = getConfigDir()
    expect(configDir).toContain(APP_NAME)
    expect(configDir).toContain('claude-usage')
  })
})

describe('getTokensPath', () => {
  it('should return a path ending with tokens.json', () => {
    const tokensPath = getTokensPath()
    expect(tokensPath).toMatch(/tokens\.json$/)
  })
})
