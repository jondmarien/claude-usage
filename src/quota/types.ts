/**
 * Quota data types
 */

export type QuotaMethod = 'cloud' | 'local' | 'auto'

export type QuotaSource = 'cloud' | 'local'

export type LimitWindowKind = 'session' | 'weekly' | 'weekly_scoped' | 'usage' | 'other'

export type AuthSource = 'claude-code' | 'api-key' | 'oauth-token'

export interface QuotaSnapshot {
  timestamp: string
  method: QuotaSource
  email?: string
  planType?: string
  promptCredits?: PromptCreditsInfo
  models: ModelQuotaInfo[]
  notes?: string[]
}

export interface ModelQuotaInfo {
  label: string
  modelId: string
  remainingPercentage?: number
  isExhausted: boolean
  resetTime?: string
  timeUntilResetMs?: number
  isAutocompleteOnly?: boolean
  windowKind?: LimitWindowKind
  tokensUsed?: number
  inputTokens?: number
  outputTokens?: number
}

export interface PromptCreditsInfo {
  available: number
  monthly: number
  usedPercentage: number
  remainingPercentage: number
}

/**
 * Stored token data
 */
export interface StoredTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
  email?: string
  projectId?: string
  source?: AuthSource
  apiKey?: string
  subscriptionType?: string
  rateLimitTier?: string
  credentialsPath?: string
}

/**
 * OAuth response from token endpoint
 */
export interface OAuthTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type?: string
  scope?: string
}

/**
 * User info from Claude / Anthropic
 */
export interface ClaudeUserInfo {
  email?: string
  name?: string
  subscriptionType?: string
  rateLimitTier?: string
}
