/**
 * Quota service - local Claude Code transcripts and/or Claude OAuth usage API
 */

import { debug } from '../core/logger.js'
import { getTokenManager } from '../claude/token-manager.js'
import { fetchOauthUsage, parseOauthUsageSnapshot } from '../claude/usage-api.js'
import { discoverClaudeCodeCredentials } from '../claude/credentials.js'
import { buildLocalUsageSnapshot, hasLocalTranscripts } from '../local/index.js'
import { AuthenticationError, NoAuthMethodAvailableError } from '../core/errors.js'
import type { QuotaMethod, QuotaSnapshot } from './types.js'

export type { QuotaMethod }

export async function fetchQuota(method: QuotaMethod = 'auto'): Promise<QuotaSnapshot> {
  if (method === 'local') {
    return fetchQuotaLocal()
  }

  if (method === 'cloud') {
    return fetchQuotaCloud()
  }

  const tokenManager = getTokenManager()
  const canUseCloud = tokenManager.isLoggedIn() || discoverClaudeCodeCredentials() !== null

  if (canUseCloud) {
    try {
      debug('service', 'Auto mode: trying Claude OAuth usage API')
      return await fetchQuotaCloud()
    } catch (err) {
      debug('service', 'Auto mode: cloud quota failed, trying local transcripts', err)
      if (hasLocalTranscripts()) {
        return fetchQuotaLocal()
      }
      throw err
    }
  }

  if (hasLocalTranscripts()) {
    debug('service', 'Auto mode: no credentials, using local transcripts')
    return fetchQuotaLocal()
  }

  throw new NoAuthMethodAvailableError()
}

async function fetchQuotaCloud(): Promise<QuotaSnapshot> {
  const tokenManager = getTokenManager()
  const accessToken = await tokenManager.getValidAccessToken()
  const email = tokenManager.getEmail()
  const tokens = tokenManager.getTokens()
  const planType = tokens?.rateLimitTier || tokens?.subscriptionType

  if (tokens?.source === 'api-key') {
    debug('service', 'API key cannot call /api/oauth/usage; falling back to local if possible')
    if (hasLocalTranscripts()) {
      const snapshot = fetchQuotaLocal()
      snapshot.notes = [
        ...(snapshot.notes || []),
        'API keys do not expose Claude Code plan quota. Showing local transcript usage only.'
      ]
      return snapshot
    }
    throw new AuthenticationError(
      'API keys cannot call the Claude Code quota endpoint. Import Claude Code OAuth credentials, set CLAUDE_CODE_OAUTH_TOKEN, or use --method local.'
    )
  }

  const response = await fetchOauthUsage(accessToken)
  return parseOauthUsageSnapshot(response, email, planType)
}

function fetchQuotaLocal(): QuotaSnapshot {
  const tokenManager = getTokenManager()
  return buildLocalUsageSnapshot(tokenManager.getEmail())
}
