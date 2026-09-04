import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchQuota } from '../../src/quota/service.js'
import * as localModule from '../../src/local/index.js'
import * as tokenManagerModule from '../../src/claude/token-manager.js'
import * as usageApi from '../../src/claude/usage-api.js'
import * as credentials from '../../src/claude/credentials.js'

vi.mock('../../src/local/index.js')
vi.mock('../../src/claude/token-manager.js')
vi.mock('../../src/claude/usage-api.js')
vi.mock('../../src/claude/credentials.js')

function mockTokenManager(loggedIn = true) {
  return {
    getEmail: vi.fn().mockReturnValue('user@example.com'),
    isLoggedIn: vi.fn().mockReturnValue(loggedIn),
    getValidAccessToken: vi.fn().mockResolvedValue('mock-token'),
    getTokens: vi.fn().mockReturnValue({
      accessToken: 'mock-token',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 3600000,
      source: 'claude-code',
      subscriptionType: 'pro'
    })
  } as any
}

describe('quota service', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(tokenManagerModule.getTokenManager).mockReturnValue(mockTokenManager())
    vi.mocked(credentials.discoverClaudeCodeCredentials).mockReturnValue(null)
  })

  it('uses cloud method when specified', async () => {
    vi.mocked(usageApi.fetchOauthUsage).mockResolvedValue({ five_hour: { utilization: 10 } } as any)
    vi.mocked(usageApi.parseOauthUsageSnapshot).mockReturnValue({
      method: 'cloud',
      timestamp: '',
      models: []
    } as any)

    const result = await fetchQuota('cloud')
    expect(usageApi.fetchOauthUsage).toHaveBeenCalled()
    expect(localModule.buildLocalUsageSnapshot).not.toHaveBeenCalled()
    expect(result.method).toBe('cloud')
  })

  it('uses local transcripts when specified', async () => {
    vi.mocked(localModule.buildLocalUsageSnapshot).mockReturnValue({
      method: 'local',
      timestamp: '',
      models: []
    } as any)

    const result = await fetchQuota('local')
    expect(localModule.buildLocalUsageSnapshot).toHaveBeenCalled()
    expect(usageApi.fetchOauthUsage).not.toHaveBeenCalled()
    expect(result.method).toBe('local')
  })

  it('auto prefers cloud when logged in', async () => {
    vi.mocked(usageApi.fetchOauthUsage).mockResolvedValue({} as any)
    vi.mocked(usageApi.parseOauthUsageSnapshot).mockReturnValue({
      method: 'cloud',
      timestamp: '',
      models: []
    } as any)

    const result = await fetchQuota('auto')
    expect(usageApi.fetchOauthUsage).toHaveBeenCalled()
    expect(result.method).toBe('cloud')
  })

  it('auto falls back to local when cloud fails', async () => {
    vi.mocked(usageApi.fetchOauthUsage).mockRejectedValue(new Error('network'))
    vi.mocked(localModule.hasLocalTranscripts).mockReturnValue(true)
    vi.mocked(localModule.buildLocalUsageSnapshot).mockReturnValue({
      method: 'local',
      timestamp: '',
      models: []
    } as any)

    const result = await fetchQuota('auto')
    expect(result.method).toBe('local')
  })

  it('uses local when no credentials exist', async () => {
    vi.mocked(tokenManagerModule.getTokenManager).mockReturnValue(mockTokenManager(false))
    vi.mocked(localModule.hasLocalTranscripts).mockReturnValue(true)
    vi.mocked(localModule.buildLocalUsageSnapshot).mockReturnValue({
      method: 'local',
      timestamp: '',
      models: []
    } as any)

    const result = await fetchQuota('auto')
    expect(result.method).toBe('local')
    expect(usageApi.fetchOauthUsage).not.toHaveBeenCalled()
  })
})
