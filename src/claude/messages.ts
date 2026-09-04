/**
 * Cheap Claude wakeup requests via Anthropic Messages or `claude -p`
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { debug } from '../core/logger.js'
import { APIError, AuthenticationError, NetworkError } from '../core/errors.js'
import type { StoredTokens } from '../quota/types.js'
import type { TokenUsage } from '../wakeup/types.js'
import { ANTHROPIC_VERSION, CLAUDE_OAUTH_BETA, MESSAGES_URL, resolveAnthropicUrl } from './models.js'

const execFileAsync = promisify(execFile)
const REQUEST_TIMEOUT_MS = 30_000

export interface MessageTriggerResult {
  text: string
  tokensUsed?: TokenUsage
}

export async function resolveClaudeCliPath(): Promise<string | null> {
  const command = process.platform === 'win32' ? 'where' : 'which'
  try {
    const { stdout } = await execFileAsync(command, ['claude'], {
      timeout: 5000,
      windowsHide: true
    })
    const first = stdout.split(/\r?\n/).map(line => line.trim()).find(Boolean)
    return first || null
  } catch {
    return null
  }
}

export async function triggerViaClaudeCli(
  modelId: string,
  prompt: string,
  maxTokens = 1
): Promise<MessageTriggerResult> {
  const cli = await resolveClaudeCliPath()
  if (!cli) {
    throw new Error('Claude Code CLI is not on PATH')
  }

  const limit = maxTokens > 0 ? maxTokens : 1
  const args = ['-p', prompt, '--model', modelId, '--max-tokens', String(limit)]

  debug('messages', `Triggering ${modelId} via Claude CLI`)

  try {
    const { stdout } = await execFileAsync(cli, args, {
      timeout: REQUEST_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 1024 * 1024
    })
    return { text: (stdout || '').trim() }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Claude CLI trigger failed: ${message}`)
  }
}

export async function triggerViaMessagesApi(
  tokens: StoredTokens,
  modelId: string,
  prompt: string,
  maxTokens = 1
): Promise<MessageTriggerResult> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'anthropic-version': ANTHROPIC_VERSION
  }

  if (tokens.source === 'api-key' || tokens.apiKey) {
    headers['x-api-key'] = tokens.apiKey || tokens.accessToken
  } else if (tokens.accessToken) {
    headers.Authorization = `Bearer ${tokens.accessToken}`
    headers['anthropic-beta'] = CLAUDE_OAUTH_BETA
  } else {
    throw new AuthenticationError('No Claude credentials available for Messages API')
  }

  let response: Response
  try {
    response = await fetch(resolveAnthropicUrl(MESSAGES_URL), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: modelId,
        max_tokens: maxTokens > 0 ? maxTokens : 1,
        messages: [{ role: 'user', content: prompt }]
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
  } catch (err) {
    throw new NetworkError(`Messages API request failed: ${err instanceof Error ? err.message : err}`)
  }

  const raw = await response.text()
  if (!response.ok) {
    throw new APIError(`Messages API returned HTTP ${response.status}: ${raw.slice(0, 200)}`, response.status)
  }

  let data: {
    content?: Array<{ type?: string; text?: string }>
    usage?: { input_tokens?: number; output_tokens?: number }
  }
  try {
    data = JSON.parse(raw)
  } catch {
    return { text: raw.slice(0, 500) }
  }

  const text = (data.content || [])
    .filter(part => part.type === 'text' && part.text)
    .map(part => part.text)
    .join('')

  const input = data.usage?.input_tokens ?? 0
  const output = data.usage?.output_tokens ?? 0

  return {
    text: text || raw.slice(0, 500),
    tokensUsed: {
      prompt: input,
      completion: output,
      total: input + output
    }
  }
}
