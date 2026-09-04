/**
 * Custom error classes for claude-usage CLI
 */

import { CLI_NAME } from './env.js'

export class NotLoggedInError extends Error {
  constructor(message = `Not logged in. Run: ${CLI_NAME} login`) {
    super(message)
    this.name = 'NotLoggedInError'
  }
}

export class AuthenticationError extends Error {
  constructor(message = 'Authentication failed. Please login again.') {
    super(message)
    this.name = 'AuthenticationError'
  }
}

export class NetworkError extends Error {
  constructor(message = 'Network error. Please check your connection.') {
    super(message)
    this.name = 'NetworkError'
  }
}

export class RateLimitError extends Error {
  retryAfterMs?: number

  constructor(message = 'Rate limited. Please try again later.', retryAfterMs?: number) {
    super(message)
    this.name = 'RateLimitError'
    this.retryAfterMs = retryAfterMs
  }
}

export class APIError extends Error {
  statusCode?: number

  constructor(message: string, statusCode?: number) {
    super(message)
    this.name = 'APIError'
    this.statusCode = statusCode
  }
}

export class TokenRefreshError extends Error {
  cause?: Error
  statusCode?: number
  isRetryable: boolean

  constructor(
    message = 'Failed to refresh token. Please login again.',
    options?: {
      cause?: Error
      statusCode?: number
      isRetryable?: boolean
    }
  ) {
    super(message)
    this.name = 'TokenRefreshError'
    this.cause = options?.cause
    this.statusCode = options?.statusCode
    this.isRetryable = options?.isRetryable ?? true
  }

  getDetailedMessage(): string {
    let msg = this.message
    if (this.statusCode) {
      msg += ` (HTTP ${this.statusCode})`
    }
    if (this.cause) {
      msg += `: ${this.cause.message}`
    }
    return msg
  }
}

export class ClaudeDataNotFoundError extends Error {
  constructor(message = 'No Claude Code session logs found. Use Claude Code at least once, or login to fetch live quota.') {
    super(message)
    this.name = 'ClaudeDataNotFoundError'
  }
}

/** @deprecated Use ClaudeDataNotFoundError */
export class AntigravityNotRunningError extends ClaudeDataNotFoundError {
  constructor(message?: string) {
    super(message)
    this.name = 'AntigravityNotRunningError'
  }
}

export class LocalConnectionError extends Error {
  constructor(message = 'Failed to read local Claude Code usage data.') {
    super(message)
    this.name = 'LocalConnectionError'
  }
}

export class PortDetectionError extends Error {
  constructor(message = 'Could not find Claude Code usage data.') {
    super(message)
    this.name = 'PortDetectionError'
  }
}

export class NoAuthMethodAvailableError extends Error {
  constructor(message = `Unable to fetch usage: no Claude Code session logs found and you are not logged in.\n\nPlease do one of the following:\n  • Use Claude Code so local session logs exist under ~/.claude/projects, or\n  • Login with: ${CLI_NAME} login`) {
    super(message)
    this.name = 'NoAuthMethodAvailableError'
  }
}
