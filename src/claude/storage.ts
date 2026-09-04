/**
 * Token storage - routes to the active account, with a legacy single-file fallback
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { getTokensPath, getConfigDir, getAccountDir } from '../core/env.js'
import { debug } from '../core/logger.js'
import {
  getActiveAccountEmail,
  setActiveAccountEmail
} from '../accounts/config.js'
import {
  saveAccountTokens,
  loadAccountTokens,
  deleteAccount,
  accountExists
} from '../accounts/storage.js'
import type { StoredTokens } from '../quota/types.js'

export function saveTokens(tokens: StoredTokens): void {
  const email = tokens.email

  if (!email) {
    const path = getTokensPath()
    const dir = dirname(path)

    debug('storage', `Saving tokens to legacy path ${path}`)

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    writeFileSync(path, JSON.stringify(tokens, null, 2), { mode: 0o600 })
    return
  }

  debug('storage', `Saving tokens for account ${email}`)
  saveAccountTokens(email, tokens)

  if (!getActiveAccountEmail()) {
    setActiveAccountEmail(email)
  }
}

export function loadTokens(): StoredTokens | null {
  const activeEmail = getActiveAccountEmail()

  if (activeEmail) {
    const tokens = loadAccountTokens(activeEmail)
    if (tokens) {
      debug('storage', `Loaded tokens for active account ${activeEmail}`)
      return tokens
    }
  }

  const legacyPath = getTokensPath()
  debug('storage', `Loading tokens from legacy path ${legacyPath}`)

  if (!existsSync(legacyPath)) {
    debug('storage', 'No tokens file found')
    return null
  }

  try {
    const content = readFileSync(legacyPath, 'utf-8')
    return JSON.parse(content) as StoredTokens
  } catch (err) {
    debug('storage', 'Failed to parse tokens file', err)
    return null
  }
}

export function deleteTokens(): boolean {
  const activeEmail = getActiveAccountEmail()

  if (activeEmail && accountExists(activeEmail)) {
    debug('storage', `Deleting account ${activeEmail}`)
    return deleteAccount(activeEmail)
  }

  const path = getTokensPath()
  debug('storage', `Deleting tokens at legacy path ${path}`)

  if (!existsSync(path)) {
    return false
  }

  try {
    unlinkSync(path)
    return true
  } catch (err) {
    debug('storage', 'Failed to delete tokens', err)
    return false
  }
}

export function hasTokens(): boolean {
  const activeEmail = getActiveAccountEmail()
  if (activeEmail && accountExists(activeEmail)) {
    return true
  }
  return existsSync(getTokensPath())
}

export function getStorageInfo(): { configDir: string; tokensPath: string; exists: boolean } {
  const configDir = getConfigDir()
  const activeEmail = getActiveAccountEmail()

  let tokensPath: string
  let exists: boolean

  if (activeEmail) {
    tokensPath = join(getAccountDir(activeEmail), 'tokens.json')
    exists = accountExists(activeEmail)
  } else {
    tokensPath = getTokensPath()
    exists = existsSync(tokensPath)
  }

  return {
    configDir,
    tokensPath,
    exists
  }
}
