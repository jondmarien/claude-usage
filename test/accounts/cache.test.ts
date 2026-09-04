/**
 * Tests for cache management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Mock the env module before importing cache
const testDir = join(tmpdir(), 'antigravity-cache-test-' + Date.now())

vi.mock('../../src/core/env.js', () => ({
  getConfigDir: () => testDir,
  getAccountsDir: () => join(testDir, 'accounts'),
  getAccountDir: (email: string) => join(testDir, 'accounts', email),
  getGlobalConfigPath: () => join(testDir, 'config.json'),
  getTokensPath: () => join(testDir, 'tokens.json')
}))

// Import after mocking
import {
  isCacheValid,
  getCacheAge,
  saveCache,
  loadCache,
  invalidateCache
} from '../../src/accounts/cache.js'
import { ensureAccountDir } from '../../src/accounts/storage.js'
import type { QuotaSnapshot } from '../../src/quota/types.js'

describe('accounts/cache', () => {
  const testEmail = 'test@example.com'
  
  beforeEach(() => {
    // Create test directory
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true })
    }
    ensureAccountDir(testEmail)
  })

  afterEach(() => {
    // Cleanup
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  describe('isCacheValid', () => {
    it('should return false when no cache exists', () => {
      expect(isCacheValid(testEmail)).toBe(false)
    })

    it('should return true for fresh cache', () => {
      const snapshot: QuotaSnapshot = {
        timestamp: new Date().toISOString(),
        method: 'local',
        models: []
      }
      
      saveCache(testEmail, snapshot)
      expect(isCacheValid(testEmail)).toBe(true)
    })
  })

  describe('saveCache / loadCache', () => {
    it('should save and load cache', () => {
      const snapshot: QuotaSnapshot = {
        timestamp: '2026-01-15T10:00:00Z',
        method: 'cloud',
        email: testEmail,
        models: [
          {
            label: 'Test Model',
            modelId: 'test-model',
            isExhausted: false,
            remainingPercentage: 0.75
          }
        ]
      }
      
      saveCache(testEmail, snapshot)
      const loaded = loadCache(testEmail)
      
      expect(loaded).not.toBeNull()
      expect(loaded?.method).toBe('cloud')
      expect(loaded?.email).toBe(testEmail)
      expect(loaded?.models.length).toBe(1)
      expect(loaded?.models[0].label).toBe('Test Model')
    })

    it('should return null for non-existent cache', () => {
      expect(loadCache('nonexistent@example.com')).toBeNull()
    })
  })

  describe('getCacheAge', () => {
    it('should return null when no cache exists', () => {
      expect(getCacheAge('nonexistent@example.com')).toBeNull()
    })

    it('should return age in seconds', () => {
      const snapshot: QuotaSnapshot = {
        timestamp: new Date().toISOString(),
        method: 'local',
        models: []
      }
      
      saveCache(testEmail, snapshot)
      const age = getCacheAge(testEmail)
      
      expect(age).not.toBeNull()
      expect(age).toBeGreaterThanOrEqual(0)
      expect(age).toBeLessThan(5) // Should be very recent
    })
  })

  describe('invalidateCache', () => {
    it('should delete cache', () => {
      const snapshot: QuotaSnapshot = {
        timestamp: new Date().toISOString(),
        method: 'local',
        models: []
      }
      
      saveCache(testEmail, snapshot)
      expect(loadCache(testEmail)).not.toBeNull()
      
      invalidateCache(testEmail)
      expect(loadCache(testEmail)).toBeNull()
    })
  })
})
