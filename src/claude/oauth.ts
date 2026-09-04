/**
 * Claude Code OAuth token refresh and profile lookup
 */

import { debug } from '../core/logger.js'
import { AuthenticationError, NetworkError, TokenRefreshError } from '../core/errors.js'
import type { ClaudeUserInfo, OAuthTokenResponse } from '../quota/types.js'
import {
  ANTHROPIC_VERSION,
  CLAUDE_CODE_CLIENT_ID,
  CLAUDE_OAUTH_BETA,
  PROFILE_URL,
  TOKEN_URL
} from './models.js'

const REQUEST_TIMEOUT_MS = 20_000

export async function refreshClaudeAccessToken(refreshToken: string): Promise<OAuthTokenResponse> {
  debug('claude-oauth', 'Refreshing Claude Code OAuth token')

  let response: Response
  try {
    response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'anthropic-beta': CLAUDE_OAUTH_BETA
      },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: CLAUDE_CODE_CLIENT_ID
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
  } catch (err) {
    throw new NetworkError(`Token refresh network error: ${err instanceof Error ? err.message : err}`)
  }

  const raw = await response.text()

  if (!response.ok) {
    const permanent = response.status === 400 || response.status === 401 || response.status === 403
    throw new TokenRefreshError(
      permanent
        ? 'Refresh token invalid or expired. Run `claude auth login`, then `claude-usage login`.'
        : `Token refresh failed with HTTP ${response.status}`,
      {
        statusCode: response.status,
        isRetryable: !permanent,
        cause: new Error(raw.slice(0, 300))
      }
    )
  }

  let data: OAuthTokenResponse
  try {
    data = JSON.parse(raw) as OAuthTokenResponse
  } catch {
    throw new TokenRefreshError('Token refresh returned invalid JSON', { isRetryable: true })
  }

  if (!data.access_token) {
    throw new TokenRefreshError('Token refresh response missing access_token', { isRetryable: true })
  }

  return data
}

export async function fetchClaudeProfile(accessToken: string): Promise<ClaudeUserInfo> {
  debug('claude-oauth', 'Fetching Claude OAuth profile')

  let response: Response
  try {
    response = await fetch(PROFILE_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'anthropic-beta': CLAUDE_OAUTH_BETA,
        'anthropic-version': ANTHROPIC_VERSION
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
  } catch (err) {
    debug('claude-oauth', 'Profile request failed', err)
    return {}
  }

  if (!response.ok) {
    debug('claude-oauth', `Profile request HTTP ${response.status}`)
    return {}
  }

  try {
    const data = await response.json() as Record<string, unknown>
    return {
      email: pickString(data, ['email', 'accountEmail', 'user_email']),
      name: pickString(data, ['name', 'displayName', 'display_name']),
      subscriptionType: pickString(data, ['subscriptionType', 'subscription_type', 'plan']),
      rateLimitTier: pickString(data, ['rateLimitTier', 'rate_limit_tier'])
    }
  } catch (err) {
    debug('claude-oauth', 'Failed to parse profile JSON', err)
    return {}
  }
}

function pickString(data: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = data[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  const account = data.account
  if (account && typeof account === 'object') {
    const nested = account as Record<string, unknown>
    for (const key of keys) {
      const value = nested[key]
      if (typeof value === 'string' && value.trim()) {
        return value.trim()
      }
    }
  }

  return undefined
}

export function assertOAuthUsable(accessToken: string): void {
  if (!accessToken) {
    throw new AuthenticationError('No Claude OAuth access token available')
  }
  if (accessToken.startsWith('sk-ant-api')) {
    throw new AuthenticationError(
      'API keys cannot call the Claude Code quota endpoint. Import Claude Code OAuth credentials or set CLAUDE_CODE_OAUTH_TOKEN.'
    )
  }
}
