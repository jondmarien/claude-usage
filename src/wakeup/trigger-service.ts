/**
 * Trigger service for auto wake-up
 * Sends a tiny Claude request via `claude -p` or the Anthropic Messages API
 */

import { debug } from '../core/logger.js'
import { getTokenManagerForAccount } from '../claude/token-manager.js'
import { resolveClaudeCliPath, triggerViaClaudeCli, triggerViaMessagesApi } from '../claude/messages.js'
import { addTriggerRecord } from './storage.js'
import type {
  TriggerOptions,
  TriggerResult,
  ModelTriggerResult,
  TriggerRecord
} from './types.js'

const DEFAULT_PROMPT = 'hi'
const MAX_CONCURRENT_REQUESTS = 4

export async function executeTrigger(options: TriggerOptions): Promise<TriggerResult> {
  const {
    models,
    accountEmail,
    triggerType,
    triggerSource,
    customPrompt,
    maxOutputTokens
  } = options

  debug('trigger-service', `Executing trigger for ${models.length} models with account ${accountEmail}`)

  if (models.length === 0) {
    return { success: true, results: [] }
  }

  let tokenManager
  try {
    tokenManager = getTokenManagerForAccount(accountEmail)
  } catch (err) {
    debug('trigger-service', `Failed to get token manager for ${accountEmail}:`, err)
    const results: ModelTriggerResult[] = models.map(modelId => ({
      modelId,
      success: false,
      durationMs: 0,
      error: `Failed to get credentials for ${accountEmail}`
    }))
    recordResults(results, options)
    return { success: false, results }
  }

  let hasAccountToken = false
  try {
    await tokenManager.getValidAccessToken()
    hasAccountToken = true
  } catch (err) {
    const claudeCli = await resolveClaudeCliPath()
    if (!claudeCli) {
      let errorMessage = `Authentication failed for ${accountEmail}`
      if (err && typeof err === 'object' && 'getDetailedMessage' in err) {
        errorMessage = (err as { getDetailedMessage: () => string }).getDetailedMessage()
      } else if (err instanceof Error) {
        errorMessage = `Token refresh failed: ${err.message}`
      }

      const results: ModelTriggerResult[] = models.map(modelId => ({
        modelId,
        success: false,
        durationMs: 0,
        error: errorMessage
      }))
      recordResults(results, options)
      return { success: false, results }
    }
  }

  const useClaudeCli = !hasAccountToken && Boolean(await resolveClaudeCliPath())
  const userPrompt = customPrompt || DEFAULT_PROMPT
  const results: ModelTriggerResult[] = []

  for (let i = 0; i < models.length; i += MAX_CONCURRENT_REQUESTS) {
    const batch = models.slice(i, i + MAX_CONCURRENT_REQUESTS)
    const batchResults = await Promise.all(
      batch.map(modelId => triggerSingleModel(
        tokenManager,
        useClaudeCli,
        modelId,
        userPrompt,
        maxOutputTokens
      ))
    )
    results.push(...batchResults)
  }

  recordResults(results, options)

  const allSuccess = results.every(r => r.success)
  const successCount = results.filter(r => r.success).length
  debug('trigger-service', `Trigger complete: ${successCount}/${results.length} succeeded`)

  return { success: allSuccess, results }
}

async function triggerSingleModel(
  tokenManager: ReturnType<typeof getTokenManagerForAccount>,
  useClaudeCli: boolean,
  modelId: string,
  prompt: string,
  maxTokens?: number
): Promise<ModelTriggerResult> {
  const startTime = Date.now()
  debug('trigger-service', `Triggering model: ${modelId} via ${useClaudeCli ? 'claude CLI' : 'Messages API'}`)

  try {
    const response = useClaudeCli
      ? await triggerViaClaudeCli(modelId, prompt, maxTokens)
      : await triggerViaMessagesApi(tokenManager.getTokens() || {
        accessToken: await tokenManager.getValidAccessToken(),
        refreshToken: '',
        expiresAt: Date.now() + 60_000
      }, modelId, prompt, maxTokens)

    const durationMs = Date.now() - startTime
    return {
      modelId,
      success: true,
      durationMs,
      response: (response.text || '').substring(0, 500),
      tokensUsed: response.tokensUsed
    }
  } catch (err) {
    const durationMs = Date.now() - startTime
    const errorMessage = err instanceof Error ? err.message : String(err)
    debug('trigger-service', `Model ${modelId} failed after ${durationMs}ms: ${errorMessage}`)
    return {
      modelId,
      success: false,
      durationMs,
      error: errorMessage
    }
  }
}

function recordResults(results: ModelTriggerResult[], options: TriggerOptions): void {
  const { triggerType, triggerSource, accountEmail, customPrompt } = options
  const prompt = customPrompt || DEFAULT_PROMPT

  for (const result of results) {
    const record: TriggerRecord = {
      timestamp: new Date().toISOString(),
      success: result.success,
      triggerType,
      triggerSource,
      models: [result.modelId],
      accountEmail,
      durationMs: result.durationMs,
      prompt,
      response: result.response,
      error: result.error,
      tokensUsed: result.tokensUsed
    }
    addTriggerRecord(record)
  }
}

export async function testTrigger(
  modelId: string,
  accountEmail: string,
  prompt?: string
): Promise<ModelTriggerResult> {
  const result = await executeTrigger({
    models: [modelId],
    accountEmail,
    triggerType: 'manual',
    triggerSource: 'manual',
    customPrompt: prompt
  })

  return result.results[0] || {
    modelId,
    success: false,
    durationMs: 0,
    error: 'No result returned'
  }
}
