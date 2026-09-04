/**
 * Quota output formatting
 */

import Table from 'cli-table3'
import type { QuotaSnapshot, ModelQuotaInfo } from './types.js'

export interface FormatOptions {
  allModels?: boolean
}

function formatTimeUntilReset(ms?: number): string {
  if (ms === undefined || ms <= 0) return 'N/A'

  const hours = Math.floor(ms / (1000 * 60 * 60))
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}

function remainingAsDisplayPercent(value?: number): number | undefined {
  if (value === undefined) return undefined
  return value > 1 ? Math.round(value) : Math.round(value * 100)
}

function formatRemaining(model: ModelQuotaInfo): string {
  if (model.isExhausted) {
    return '❌ EXHAUSTED'
  }
  if (model.remainingPercentage === undefined) {
    if (model.tokensUsed !== undefined) {
      return `${model.tokensUsed.toLocaleString()} tok`
    }
    return 'N/A'
  }

  const pct = remainingAsDisplayPercent(model.remainingPercentage) ?? 0
  if (pct >= 75) return `🟢 ${pct}%`
  if (pct >= 50) return `🟡 ${pct}%`
  if (pct >= 25) return `🟠 ${pct}%`
  return `🔴 ${pct}%`
}

export function printQuotaTable(snapshot: QuotaSnapshot, options: FormatOptions = {}): void {
  const timestamp = new Date(snapshot.timestamp).toLocaleString()

  console.log()
  console.log(`📊 Claude Quota Status (via ${snapshot.method.toUpperCase()})`)
  console.log(`   Retrieved: ${timestamp}`)

  if (snapshot.email || snapshot.planType) {
    const userParts: string[] = []
    if (snapshot.email) {
      userParts.push(`👤 ${snapshot.email}`)
    }
    if (snapshot.planType) {
      userParts.push(`📋 Plan: ${snapshot.planType}`)
    }
    console.log(`   ${userParts.join(' | ')}`)
  }

  if (snapshot.promptCredits) {
    const pc = snapshot.promptCredits
    console.log(`   Extra usage: ${pc.available} / ${pc.monthly} remaining`)
  }

  const visibleModels = options.allModels
    ? snapshot.models
    : snapshot.models.filter(m => !m.isAutocompleteOnly)

  const hasRemaining = visibleModels.some(m => m.remainingPercentage !== undefined)
  const hasUsage = visibleModels.some(m => m.tokensUsed !== undefined)

  if (visibleModels.length > 0) {
    const head = hasRemaining
      ? ['Window / Model', 'Remaining', 'Resets In']
      : hasUsage
        ? ['Model', 'Tokens', 'Output']
        : ['Model', 'Remaining', 'Resets In']

    const table = new Table({
      head,
      style: {
        head: ['cyan'],
        border: ['gray']
      }
    })

    for (const model of visibleModels) {
      if (!hasRemaining && hasUsage) {
        table.push([
          model.label,
          (model.tokensUsed ?? 0).toLocaleString(),
          (model.outputTokens ?? 0).toLocaleString()
        ])
      } else {
        table.push([
          model.label,
          formatRemaining(model),
          formatTimeUntilReset(model.timeUntilResetMs)
        ])
      }
    }

    console.log(table.toString())
  } else {
    console.log('No model quota information available.')
    if (!options.allModels && snapshot.models.some(m => m.isAutocompleteOnly)) {
      console.log('Tip: Use --all-models to see hidden models.')
    }
  }

  if (snapshot.notes?.length) {
    console.log()
    for (const note of snapshot.notes) {
      console.log(`   ℹ️  ${note}`)
    }
  }

  console.log()
}

export function printQuotaJson(snapshot: QuotaSnapshot): void {
  console.log(JSON.stringify(snapshot, null, 2))
}
