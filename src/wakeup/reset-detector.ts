/**
 * Reset detector for auto wake-up
 *
 * Detect unused Claude quota windows (session ~5h, weekly ~7d) and trigger
 * the configured Claude models. Window IDs like "session" are never sent
 * to the Messages API.
 */

import { debug } from '../core/logger.js'
import type { QuotaSnapshot, ModelQuotaInfo } from '../quota/types.js'
import {
  getOrCreateConfig,
  loadResetState,
  updateResetState
} from './storage.js'
import { getAccountManager } from '../accounts/manager.js'
import { executeTrigger } from './trigger-service.js'
import type { DetectionResult } from './types.js'
import { DEFAULT_WAKEUP_MODELS } from '../claude/models.js'

// Smart trigger thresholds
const FULL_QUOTA_THRESHOLD = 99
const SESSION_RESET_MIN_HOURS = 4.5
const SESSION_RESET_MAX_HOURS = 5.5
const WEEKLY_RESET_MIN_HOURS = 6.5 * 24
const WEEKLY_RESET_MAX_HOURS = 7.5 * 24

function remainingAsPercent(value?: number): number | undefined {
  if (value === undefined) return undefined
  return value > 1 ? value : value * 100
}

// Cooldown between triggers for same model
const DEFAULT_COOLDOWN_MS = 60 * 60 * 1000 // 1 hour (since we're looking at ~5h window)

/**
 * Check if a Claude limit looks freshly reset / unused.
 *
 * Session windows on Claude Code plans are typically ~5 hours.
 * Weekly windows are ~7 days. We do not pretend weekly limits reset in 5 hours.
 */
export function isModelUnused(model: ModelQuotaInfo): boolean {
  if (model.windowKind === 'usage') {
    return false
  }

  const remaining = remainingAsPercent(model.remainingPercentage)
  if (remaining === undefined) {
    debug('reset-detector', `${model.modelId}: No remaining percentage data`)
    return false
  }

  if (remaining < FULL_QUOTA_THRESHOLD) {
    debug('reset-detector', `${model.modelId}: Not full (${remaining}%)`)
    return false
  }

  if (model.timeUntilResetMs === undefined) {
    debug('reset-detector', `${model.modelId}: No reset time data`)
    return false
  }

  const hoursUntilReset = model.timeUntilResetMs / (60 * 60 * 1000)
  const weekly = model.windowKind === 'weekly' || model.windowKind === 'weekly_scoped'
  const minHours = weekly ? WEEKLY_RESET_MIN_HOURS : SESSION_RESET_MIN_HOURS
  const maxHours = weekly ? WEEKLY_RESET_MAX_HOURS : SESSION_RESET_MAX_HOURS

  if (hoursUntilReset < minHours || hoursUntilReset > maxHours) {
    debug('reset-detector', `${model.modelId}: Reset time ${hoursUntilReset.toFixed(1)}h not in unused window`)
    return false
  }

  debug('reset-detector', `${model.modelId}: UNUSED - ${remaining}% remaining`)
  return true
}

/**
 * Get all valid account emails
 */
function getAllValidAccounts(): string[] {
  const accountManager = getAccountManager()
  const allEmails = accountManager.getAccountEmails()
  
  return allEmails.filter(email => {
    const status = accountManager.getAccountStatus(email)
    return status === 'valid' || status === 'expired' // Expired can be refreshed
  })
}

/**
 * Map unused Claude quota windows onto real Messages / Claude Code model IDs.
 * Quota rows are session/weekly windows, not model names.
 */
export function modelsForUnusedWindows(
  unused: ModelQuotaInfo[],
  selectedModels: string[] = [...DEFAULT_WAKEUP_MODELS]
): string[] {
  const selected = selectedModels.length > 0 ? selectedModels : [...DEFAULT_WAKEUP_MODELS]
  const wanted = new Set<string>()

  for (const window of unused) {
    const haystack = `${window.modelId} ${window.label}`.toLowerCase()
    const scoped = window.windowKind === 'weekly_scoped' || haystack.includes('sonnet') || haystack.includes('opus')

    if (scoped && haystack.includes('opus')) {
      const opus = selected.filter(id => id.toLowerCase().includes('opus'))
      if (opus.length > 0) {
        opus.forEach(id => wanted.add(id))
      } else {
        wanted.add('claude-opus-5')
      }
      continue
    }

    if (scoped && haystack.includes('sonnet')) {
      const sonnet = selected.filter(id => id.toLowerCase().includes('sonnet'))
      if (sonnet.length > 0) {
        sonnet.forEach(id => wanted.add(id))
      } else {
        wanted.add('claude-sonnet-5')
      }
      continue
    }

    selected.forEach(id => wanted.add(id))
  }

  return [...wanted]
}

/**
 * Detect unused quota windows and trigger configured Claude models.
 *
 * Quota snapshots expose session/weekly windows, not Gemini-style model IDs.
 * Only runs when wakeup is enabled in reset mode.
 */
export async function detectResetAndTrigger(snapshot: QuotaSnapshot): Promise<DetectionResult> {
  debug('reset-detector', 'Checking for unused quota windows')

  const config = getOrCreateConfig()

  if (!config.enabled || !config.wakeOnReset) {
    debug('reset-detector', 'Wakeup reset mode is not enabled')
    return { triggered: false, triggeredModels: [] }
  }

  const accounts = getAllValidAccounts()
  if (accounts.length === 0) {
    debug('reset-detector', 'No valid accounts available')
    return { triggered: false, triggeredModels: [] }
  }

  debug('reset-detector', `Found ${accounts.length} valid accounts`)

  const resetState = loadResetState()
  const now = Date.now()
  const unusedWindows: ModelQuotaInfo[] = []

  for (const window of snapshot.models) {
    if (!isModelUnused(window)) {
      continue
    }

    const previousState = resetState[window.modelId]
    if (previousState) {
      const lastTriggered = new Date(previousState.lastTriggeredTime).getTime()
      const cooldownRemaining = DEFAULT_COOLDOWN_MS - (now - lastTriggered)
      if (cooldownRemaining > 0) {
        debug('reset-detector', `${window.modelId}: In cooldown (${Math.round(cooldownRemaining / 60000)}min remaining)`)
        continue
      }
    }

    unusedWindows.push(window)
    updateResetState(window.modelId, window.resetTime || new Date().toISOString())
  }

  const modelsToTrigger = modelsForUnusedWindows(unusedWindows, config.selectedModels)

  if (modelsToTrigger.length === 0) {
    debug('reset-detector', 'No unused windows to trigger')
    return { triggered: false, triggeredModels: [] }
  }
  
  console.log(`\n🔄 Found ${modelsToTrigger.length} unused model(s): ${modelsToTrigger.join(', ')}`)
  console.log(`   Triggering for ${accounts.length} account(s)...`)
  
  // Trigger for ALL accounts
  let successCount = 0
  for (const accountEmail of accounts) {
    try {
      const result = await executeTrigger({
        models: modelsToTrigger,
        accountEmail,
        triggerType: 'auto',
        triggerSource: 'quota_reset',
        customPrompt: config.customPrompt,
        maxOutputTokens: config.maxOutputTokens
      })
      
      const modelSuccess = result.results.filter(r => r.success).length
      console.log(`   ✅ ${accountEmail}: ${modelSuccess}/${modelsToTrigger.length} succeeded`)
      if (modelSuccess > 0) successCount++
    } catch (err) {
      console.log(`   ❌ ${accountEmail}: ${err instanceof Error ? err.message : err}`)
      debug('reset-detector', `Trigger failed for ${accountEmail}:`, err)
    }
  }
  
  console.log(`\n📊 Wake-up complete: ${successCount}/${accounts.length} accounts triggered\n`)
  
  return { 
    triggered: true, 
    triggeredModels: modelsToTrigger 
  }
}

/**
 * Get list of unused models for display/testing
 */
export function findUnusedModels(snapshot: QuotaSnapshot): ModelQuotaInfo[] {
  return snapshot.models.filter(isModelUnused)
}

/**
 * Check if any models need triggering (for status display)
 */
export function hasUnusedModels(snapshot: QuotaSnapshot): boolean {
  return snapshot.models.some(isModelUnused)
}
