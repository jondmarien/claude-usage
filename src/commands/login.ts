/**
 * Login command - import Claude Code credentials or register an API key / setup token
 */

import { getAccountManager } from '../accounts/index.js'
import { success, error as logError, info, warn } from '../core/logger.js'
import { resetTokenManager } from '../claude/token-manager.js'
import {
  defaultAccountId,
  discoverClaudeCodeCredentials,
  discoveredToStoredTokens
} from '../claude/credentials.js'
import { fetchClaudeProfile } from '../claude/oauth.js'
import { CLI_NAME } from '../core/env.js'

interface LoginOptions {
  noBrowser?: boolean
  port?: number
  manual?: boolean
  apiKey?: boolean | string
  token?: string
}

export async function loginCommand(options: LoginOptions): Promise<void> {
  const manager = getAccountManager()

  try {
    if (options.apiKey) {
      await loginWithApiKey(typeof options.apiKey === 'string' ? options.apiKey : process.env.ANTHROPIC_API_KEY)
      return
    }

    if (options.token || process.env.CLAUDE_CODE_OAUTH_TOKEN && options.manual) {
      await loginWithSetupToken(options.token || process.env.CLAUDE_CODE_OAUTH_TOKEN)
      return
    }

    const discovered = discoverClaudeCodeCredentials()
    if (!discovered) {
      printLoginHelp(options)
      process.exit(1)
    }

    let email = defaultAccountId(discovered)
    if (discovered.source !== 'api-key' && discovered.accessToken) {
      const profile = await fetchClaudeProfile(discovered.accessToken)
      if (profile.email) {
        email = profile.email
      }
      if (profile.subscriptionType) {
        discovered.subscriptionType = discovered.subscriptionType || profile.subscriptionType
      }
    }

    const tokens = discoveredToStoredTokens(discovered, email)
    manager.addAccount(tokens, email)
    resetTokenManager()

    success(`Imported Claude credentials as ${email}`)
    if (discovered.subscriptionType || discovered.rateLimitTier) {
      info(`Plan: ${discovered.rateLimitTier || discovered.subscriptionType}`)
    }
    if (discovered.source === 'claude-code') {
      info('Tokens stay in Claude Code\'s local credentials file. claude-usage never sends them to a third-party server.')
    }

    const accounts = manager.getAccountEmails()
    if (accounts.length > 1) {
      info(`You now have ${accounts.length} accounts. Use \`${CLI_NAME} accounts list\` to see all.`)
    }

    process.exit(0)
  } catch (err) {
    logError(`Login failed: ${err instanceof Error ? err.message : err}`)
    process.exit(1)
  }
}

async function loginWithApiKey(apiKey?: string): Promise<void> {
  if (!apiKey) {
    logError('No API key provided. Pass --api-key <key> or set ANTHROPIC_API_KEY.')
    process.exit(1)
  }

  const manager = getAccountManager()
  manager.addAccount({
    accessToken: apiKey,
    refreshToken: '',
    expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
    email: 'api-key',
    source: 'api-key',
    apiKey
  }, 'api-key')
  resetTokenManager()
  success('Stored ANTHROPIC_API_KEY locally as account "api-key".')
  warn('API keys cannot read Claude Code plan quota. Use them for wakeup Messages API or local transcript reports.')
  process.exit(0)
}

async function loginWithSetupToken(token?: string): Promise<void> {
  if (!token) {
    logError('No setup token provided. Run `claude setup-token`, then `claude-usage login --token <token>`.')
    process.exit(1)
  }

  const manager = getAccountManager()
  let email = 'claude-oauth'
  try {
    const profile = await fetchClaudeProfile(token)
    if (profile.email) email = profile.email
  } catch {
    // Profile is optional
  }

  manager.addAccount({
    accessToken: token,
    refreshToken: '',
    expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
    email,
    source: 'oauth-token'
  }, email)
  resetTokenManager()
  success(`Stored Claude setup token as ${email}`)
  process.exit(0)
}

function printLoginHelp(options: LoginOptions): void {
  warn('No Claude Code credentials found.')
  console.log(`
claude-usage does not run Google OAuth. Sign in with Claude Code, then import:

  1. claude auth login
  2. ${CLI_NAME} login

Claude Code stores OAuth tokens in:
  ~/.claude/.credentials.json
  or $CLAUDE_CONFIG_DIR/.credentials.json
  Windows: %USERPROFILE%\\.claude\\.credentials.json

On macOS, Claude Code may keep tokens in Keychain only. If the credentials
file is missing, run \`claude setup-token\` and then:

  ${CLI_NAME} login --token <token>

Other options:
  ${CLI_NAME} login --api-key            # use ANTHROPIC_API_KEY (no plan quota)
  ${CLI_NAME} login --token <oauth>      # CLAUDE_CODE_OAUTH_TOKEN / setup-token
`)

  if (options.noBrowser || options.manual) {
    info('--no-browser / --manual no longer open a Google OAuth page. Use the Claude Code login flow above.')
  }
}
