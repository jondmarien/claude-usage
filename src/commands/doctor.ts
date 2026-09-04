/**
 * Doctor command - diagnostics and troubleshooting
 */

import { getTokenManager } from '../claude/token-manager.js'
import { getStorageInfo } from '../claude/storage.js'
import { getConfigDir, getPlatform, CLI_NAME } from '../core/env.js'
import { maskEmail } from '../core/mask.js'
import { version } from '../version.js'
import { discoverClaudeCodeCredentials } from '../claude/credentials.js'
import { findClaudeCredentialsPath, getClaudeProjectsDirs } from '../claude/paths.js'
import { hasLocalTranscripts, listTranscriptFiles } from '../local/index.js'
import { resolveClaudeCliPath } from '../claude/messages.js'
import { isCronSupported, isWindows } from '../wakeup/cron-installer.js'

export async function doctorCommand(): Promise<void> {
  console.log()
  console.log('🩺 Claude Usage - Diagnostics')
  console.log('═'.repeat(50))
  console.log()

  console.log('📦 Version')
  console.log('─'.repeat(40))
  console.log(`  CLI version: ${version}`)
  console.log(`  Node.js: ${process.version}`)
  console.log(`  Platform: ${getPlatform()}`)
  console.log()

  const storage = getStorageInfo()
  console.log('📁 Configuration')
  console.log('─'.repeat(40))
  console.log(`  Config dir: ${storage.configDir}`)
  console.log(`  Tokens file: ${storage.tokensPath}`)
  console.log(`  Tokens exist: ${storage.exists ? 'Yes' : 'No'}`)
  console.log(`  Expected config dir: ${getConfigDir()}`)
  console.log()

  console.log('📂 Claude Code local data')
  console.log('─'.repeat(40))
  const credsPath = findClaudeCredentialsPath()
  console.log(`  Credentials file: ${credsPath || 'Not found'}`)
  console.log(`  CLAUDE_CONFIG_DIR: ${process.env.CLAUDE_CONFIG_DIR || '(default ~/.claude and ~/.config/claude)'}`)
  const projectDirs = getClaudeProjectsDirs()
  console.log(`  Project dirs: ${projectDirs.length ? projectDirs.join(', ') : 'None'}`)
  console.log(`  Transcripts: ${hasLocalTranscripts() ? `${listTranscriptFiles().length} jsonl files` : 'None'}`)
  const claudeCli = await resolveClaudeCliPath()
  console.log(`  Claude CLI: ${claudeCli || 'Not on PATH'}`)
  console.log()

  const tokenManager = getTokenManager()
  console.log('🔐 Authentication')
  console.log('─'.repeat(40))

  const discovered = discoverClaudeCodeCredentials()
  if (!tokenManager.isLoggedIn()) {
    console.log('  Status: Not logged in to claude-usage')
    if (discovered) {
      console.log(`  Claude Code credentials: Found (${discovered.source})`)
      console.log(`  💡 Run \`${CLI_NAME} login\` to import them.`)
    } else {
      console.log('  Claude Code credentials: Not found')
      console.log(`  💡 Run \`claude auth login\`, then \`${CLI_NAME} login\`.`)
    }
  } else {
    console.log('  Status: Logged in')
    const email = tokenManager.getEmail()
    if (email) {
      console.log(`  Account: ${maskEmail(email)}`)
    }
    const tokens = tokenManager.getTokens()
    if (tokens?.source) {
      console.log(`  Source: ${tokens.source}`)
    }
    const expiresAt = tokenManager.getExpiresAt()
    if (expiresAt && tokens?.source !== 'api-key') {
      console.log(`  Token expires: ${expiresAt.toLocaleString()}`)
      console.log(`  Token valid: ${tokenManager.isTokenExpired() ? 'No (needs refresh)' : 'Yes'}`)
    }
  }

  console.log()
  console.log('⏰ Auto Wakeup scheduler')
  console.log('─'.repeat(40))
  if (isWindows()) {
    console.log('  Backend: Windows Task Scheduler (schtasks)')
  } else if (isCronSupported()) {
    console.log('  Backend: cron')
  } else {
    console.log('  Backend: unsupported platform')
  }
  console.log()

  console.log('🔧 Environment')
  console.log('─'.repeat(40))
  console.log(`  ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? 'Set' : 'Not set'}`)
  console.log(`  CLAUDE_CODE_OAUTH_TOKEN: ${process.env.CLAUDE_CODE_OAUTH_TOKEN ? 'Set' : 'Not set'}`)
  console.log(`  ANTHROPIC_BASE_URL: ${process.env.ANTHROPIC_BASE_URL || '(default api.anthropic.com)'}`)
  console.log()
}
