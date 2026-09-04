/**
 * Logout command - remove account(s)
 */

import { getAccountManager } from '../accounts/index.js'
import { resetTokenManager } from '../claude/token-manager.js'
import { success, warn, info } from '../core/logger.js'

interface LogoutOptions {
  all?: boolean
}

export function logoutCommand(options: LogoutOptions, email?: string): void {
  const manager = getAccountManager()

  if (options.all) {
    const count = manager.removeAllAccounts()
    resetTokenManager()

    if (count > 0) {
      success(`Logged out of ${count} account(s).`)
    } else {
      warn('No accounts to log out.')
    }
    return
  }

  if (email) {
    if (!manager.hasAccount(email)) {
      warn(`Account '${email}' not found.`)
      return
    }

    const removed = manager.removeAccount(email)
    resetTokenManager()

    if (removed) {
      success(`Logged out of ${email}.`)
      const remaining = manager.getAccountEmails()
      if (remaining.length > 0) {
        info(`Active account: ${manager.getActiveEmail() || 'none'}`)
      }
    } else {
      warn(`Could not log out of ${email}.`)
    }
    return
  }

  const activeEmail = manager.getActiveEmail()

  if (!activeEmail) {
    warn('Not logged in.')
    return
  }

  const removed = manager.removeAccount(activeEmail)
  resetTokenManager()

  if (removed) {
    success(`Logged out of ${activeEmail}.`)
    const remaining = manager.getAccountEmails()
    if (remaining.length > 0) {
      info(`Switched to: ${manager.getActiveEmail()}`)
    }
  } else {
    warn('Could not delete account.')
  }
}
