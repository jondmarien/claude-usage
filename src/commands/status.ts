/**
 * Status command - show current login status
 */

import { getTokenManager, getTokenManagerForAccount } from '../claude/token-manager.js'
import { getAccountManager } from '../accounts/index.js'
import { maskEmail, maskToken } from '../core/mask.js'
import { info, warn } from '../core/logger.js'
import { isDebugMode } from '../core/logger.js'
import { CLI_NAME } from '../core/env.js'
import { discoverClaudeCodeCredentials } from '../claude/credentials.js'
import Table from 'cli-table3'

interface StatusOptions {
  all?: boolean
  account?: string
}

function showSingleAccountStatus(email?: string): void {
  const tokenManager = email
    ? getTokenManagerForAccount(email)
    : getTokenManager()

  console.log()
  console.log('📍 Claude Usage Status')
  console.log('─'.repeat(40))

  if (!tokenManager.isLoggedIn()) {
    const discovered = discoverClaudeCodeCredentials()
    if (discovered) {
      warn('Claude Code credentials exist but are not imported yet.')
      info(`Run \`${CLI_NAME} login\` to import them.`)
      console.log()
      return
    }
    warn('Not logged in')
    console.log()
    info(`Run \`${CLI_NAME} login\` to import Claude Code credentials.`)
    console.log()
    return
  }

  const accountEmail = tokenManager.getEmail()
  const expiresAt = tokenManager.getExpiresAt()
  const isExpired = tokenManager.isTokenExpired()
  const tokens = email
    ? getAccountManager().getTokens(email)
    : getAccountManager().getActiveTokens() || tokenManager.getTokens()

  console.log(`✅ Logged in: Yes`)

  if (accountEmail) {
    console.log(`📧 Account: ${maskEmail(accountEmail)}`)
  }

  if (tokens?.source) {
    console.log(`🔑 Source: ${tokens.source}`)
  }

  if (tokens?.subscriptionType || tokens?.rateLimitTier) {
    console.log(`📋 Plan: ${tokens.rateLimitTier || tokens.subscriptionType}`)
  }

  if (expiresAt && tokens?.source !== 'api-key') {
    const expiryStr = expiresAt.toLocaleString()
    const status = isExpired ? ' (expired/expiring soon)' : ''
    console.log(`⏰ Token expires: ${expiryStr}${status}`)
  }

  if (isDebugMode() && tokens) {
    console.log()
    console.log('Debug info:')
    console.log(`  Access token: ${maskToken(tokens.accessToken)}`)
    if (tokens.refreshToken) {
      console.log(`  Refresh token: ${maskToken(tokens.refreshToken)}`)
    }
  }

  console.log()
}

function showAllAccountsStatus(): void {
  const manager = getAccountManager()
  const emails = manager.getAccountEmails()
  const activeEmail = manager.getActiveEmail()

  console.log()
  console.log('📍 Claude Usage Status - All Accounts')
  console.log('═'.repeat(60))

  if (emails.length === 0) {
    warn('No accounts found.')
    console.log()
    info(`Run \`${CLI_NAME} login\` to import Claude Code credentials.`)
    console.log()
    return
  }

  const table = new Table({
    head: ['Account', 'Logged In', 'Token Expiry'],
    style: {
      head: ['cyan'],
      border: ['gray']
    },
    colWidths: [30, 12, 28]
  })

  for (const email of emails) {
    const tokenManager = getTokenManagerForAccount(email)
    const isActive = email === activeEmail
    const nameDisplay = isActive ? `${email} [*]` : email

    if (tokenManager.isLoggedIn()) {
      const expiresAt = tokenManager.getExpiresAt()
      const isExpired = tokenManager.isTokenExpired()

      let expiryDisplay = '-'
      if (expiresAt) {
        expiryDisplay = expiresAt.toLocaleString()
        if (isExpired) {
          expiryDisplay = `⚠️ ${expiryDisplay}`
        }
      }

      table.push([nameDisplay, '✅', expiryDisplay])
    } else {
      table.push([nameDisplay, '❌', 'Invalid or missing'])
    }
  }

  console.log(table.toString())
  console.log()
  console.log('[*] = active account')
  console.log()
}

export function statusCommand(options: StatusOptions = {}): void {
  if (options.all) {
    showAllAccountsStatus()
    return
  }

  if (options.account) {
    const manager = getAccountManager()
    if (!manager.hasAccount(options.account)) {
      warn(`Account '${options.account}' not found.`)
      return
    }
    showSingleAccountStatus(options.account)
    return
  }

  showSingleAccountStatus()
}
