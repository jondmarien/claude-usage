/**
 * Token manager for Claude Code OAuth, setup tokens, and API keys
 */

import { debug } from '../core/logger.js'
import { NotLoggedInError, TokenRefreshError } from '../core/errors.js'
import {
  getActiveAccountEmail,
  loadAccountTokens,
  saveAccountTokens,
  accountExists,
  updateLastUsed
} from '../accounts/index.js'
import type { StoredTokens } from '../quota/types.js'
import {
  discoverClaudeCodeCredentials,
  writeClaudeCodeTokens
} from './credentials.js'
import { refreshClaudeAccessToken } from './oauth.js'
import { loadTokens, saveTokens, hasTokens } from './storage.js'

const EXPIRY_BUFFER_MS = 5 * 60 * 1000

export class TokenManager {
  private tokens: StoredTokens | null = null
  private accountEmail: string | null = null

  constructor(email?: string) {
    if (email) {
      this.accountEmail = email
      this.tokens = loadAccountTokens(email)
    } else {
      this.accountEmail = getActiveAccountEmail()
      if (this.accountEmail) {
        this.tokens = loadAccountTokens(this.accountEmail)
      } else {
        this.tokens = loadTokens()
      }
    }

    this.hydrateFromClaudeCodeFile()
  }

  getAccountEmail(): string | null {
    return this.accountEmail || this.tokens?.email || null
  }

  isLoggedIn(): boolean {
    if (this.tokens?.source === 'api-key' && (this.tokens.apiKey || this.tokens.accessToken)) {
      return true
    }
    if (this.accountEmail) {
      return accountExists(this.accountEmail) && this.tokens !== null
    }
    return (hasTokens() && this.tokens !== null) || discoverClaudeCodeCredentials() !== null
  }

  getEmail(): string | undefined {
    return this.tokens?.email
  }

  getExpiresAt(): Date | undefined {
    if (!this.tokens?.expiresAt) return undefined
    return new Date(this.tokens.expiresAt)
  }

  getProjectId(): string | undefined {
    return this.tokens?.projectId
  }

  setProjectId(projectId: string): void {
    if (!this.tokens) return
    this.tokens.projectId = projectId
    this.persist()
  }

  isTokenExpired(): boolean {
    if (!this.tokens) return true
    if (this.tokens.source === 'api-key') return false
    if (!this.tokens.refreshToken && this.tokens.source === 'oauth-token') return false
    return Date.now() >= this.tokens.expiresAt - EXPIRY_BUFFER_MS
  }

  async getValidAccessToken(): Promise<string> {
    this.hydrateFromClaudeCodeFile()

    if (!this.tokens) {
      throw new NotLoggedInError()
    }

    if (this.tokens.source === 'api-key') {
      return this.tokens.apiKey || this.tokens.accessToken
    }

    if (this.isTokenExpired()) {
      try {
        await this.refreshToken()
      } catch (err) {
        const isActive = !this.accountEmail || this.accountEmail === getActiveAccountEmail()
        if (isActive) {
          this.hydrateFromClaudeCodeFile({ allowFileTakeover: true })
          if (this.tokens?.accessToken && !this.isTokenExpired()) {
            this.persist()
            return this.tokens.accessToken
          }
        }
        throw err
      }
    }

    return this.tokens.accessToken
  }

  getTokens(): StoredTokens | null {
    return this.tokens
  }

  async refreshToken(): Promise<void> {
    if (!this.tokens) {
      throw new NotLoggedInError()
    }

    if (this.tokens.source === 'api-key') {
      return
    }

    if (!this.tokens.refreshToken) {
      throw new NotLoggedInError('No refresh token available. Run `claude auth login`, then `claude-usage login`.')
    }

    const MAX_RETRIES = 3
    const BASE_DELAY_MS = 1000
    let lastError: Error | undefined

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        debug('token-manager', `Refreshing Claude token (attempt ${attempt}/${MAX_RETRIES})`)
        const response = await refreshClaudeAccessToken(this.tokens.refreshToken)

        this.tokens = {
          ...this.tokens,
          accessToken: response.access_token,
          refreshToken: response.refresh_token || this.tokens.refreshToken,
          expiresAt: Date.now() + (response.expires_in || 3600) * 1000
        }

        this.persist()

        if (this.tokens.credentialsPath) {
          writeClaudeCodeTokens(this.tokens.credentialsPath, {
            accessToken: this.tokens.accessToken,
            refreshToken: this.tokens.refreshToken,
            expiresAt: this.tokens.expiresAt
          })
        }

        debug('token-manager', 'Claude token refreshed')
        return
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        const message = lastError.message.toLowerCase()
        const isPermanent =
          lastError instanceof TokenRefreshError
            ? !lastError.isRetryable
            : message.includes('invalid_grant') || message.includes('400') || message.includes('401')

        if (isPermanent) {
          throw lastError instanceof TokenRefreshError
            ? lastError
            : new TokenRefreshError('Refresh token invalid or expired. Please login again.', {
              cause: lastError,
              isRetryable: false
            })
        }

        if (attempt < MAX_RETRIES) {
          await this.sleep(BASE_DELAY_MS * Math.pow(2, attempt - 1))
        }
      }
    }

    throw new TokenRefreshError(`Failed to refresh token after ${MAX_RETRIES} attempts`, {
      cause: lastError,
      isRetryable: true
    })
  }

  reload(): void {
    if (this.accountEmail) {
      this.tokens = loadAccountTokens(this.accountEmail)
    } else {
      this.tokens = loadTokens()
    }
    this.hydrateFromClaudeCodeFile()
  }

  private hydrateFromClaudeCodeFile(options?: { allowFileTakeover?: boolean }): void {
    if (!this.tokens?.credentialsPath && this.tokens?.source !== 'claude-code') {
      return
    }

    const discovered = discoverClaudeCodeCredentials()
    if (!discovered || discovered.source !== 'claude-code') {
      return
    }

    const sameRefresh = Boolean(
      this.tokens.refreshToken &&
      discovered.refreshToken &&
      this.tokens.refreshToken === discovered.refreshToken
    )
    const sameAccess = Boolean(
      this.tokens.accessToken &&
      discovered.accessToken &&
      this.tokens.accessToken === discovered.accessToken
    )
    const sameFile = Boolean(
      this.tokens.credentialsPath &&
      discovered.credentialsPath === this.tokens.credentialsPath
    )

    if (!sameRefresh && !sameAccess) {
      if (!options?.allowFileTakeover || !sameFile) {
        debug('token-manager', 'Skipping Claude Code hydrate for a different stored account')
        return
      }
    }

    this.tokens = {
      ...this.tokens,
      accessToken: discovered.accessToken || this.tokens.accessToken,
      refreshToken: discovered.refreshToken || this.tokens.refreshToken,
      expiresAt: discovered.expiresAt || this.tokens.expiresAt,
      subscriptionType: discovered.subscriptionType || this.tokens.subscriptionType,
      rateLimitTier: discovered.rateLimitTier || this.tokens.rateLimitTier,
      credentialsPath: discovered.credentialsPath || this.tokens.credentialsPath,
      source: 'claude-code'
    }
  }

  private persist(): void {
    if (!this.tokens) return
    if (this.accountEmail) {
      saveAccountTokens(this.accountEmail, this.tokens)
      updateLastUsed(this.accountEmail)
    } else {
      saveTokens(this.tokens)
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

let tokenManagerInstance: TokenManager | null = null

export function getTokenManager(): TokenManager {
  if (!tokenManagerInstance) {
    tokenManagerInstance = new TokenManager()
  }
  return tokenManagerInstance
}

export function getTokenManagerForAccount(email: string): TokenManager {
  return new TokenManager(email)
}

export function resetTokenManager(): void {
  tokenManagerInstance = null
}
