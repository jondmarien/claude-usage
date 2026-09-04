/**
 * Claude Code quota via GET /api/oauth/usage
 *
 * This is the same undocumented endpoint Claude Code's /usage command uses.
 * It is not a public Anthropic product API and may change without notice.
 */

import { debug } from '../core/logger.js'
import { APIError, AuthenticationError, NetworkError, RateLimitError } from '../core/errors.js'
import type { ModelQuotaInfo, PromptCreditsInfo, QuotaSnapshot } from '../quota/types.js'
import { ANTHROPIC_VERSION, CLAUDE_OAUTH_BETA, USAGE_URL, resolveAnthropicUrl } from './models.js'
import { version } from '../version.js'

interface UsageWindow {
  utilization?: number | null
  resets_at?: string | null
}

interface StructuredLimit {
  kind?: string
  percent?: number
  utilization?: number
  resets_at?: string
  scope?: {
    model?: {
      display_name?: string
      name?: string
    }
  }
}

interface ExtraUsage {
  is_enabled?: boolean
  monthly_limit?: number
  used_credits?: number
  utilization?: number | null
}

interface OauthUsageResponse {
  five_hour?: UsageWindow | null
  seven_day?: UsageWindow | null
  seven_day_sonnet?: UsageWindow | null
  seven_day_opus?: UsageWindow | null
  extra_usage?: ExtraUsage | null
  limits?: StructuredLimit[]
  [key: string]: unknown
}

const REQUEST_TIMEOUT_MS = 20_000

export async function fetchOauthUsage(accessToken: string): Promise<OauthUsageResponse> {
  let response: Response
  try {
    response = await fetch(resolveAnthropicUrl(USAGE_URL), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'anthropic-beta': CLAUDE_OAUTH_BETA,
        'anthropic-version': ANTHROPIC_VERSION,
        'User-Agent': `claude-usage/${version}`
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
  } catch (err) {
    throw new NetworkError(`Quota request failed: ${err instanceof Error ? err.message : err}`)
  }

  const raw = await response.text()

  if (response.status === 401 || response.status === 403) {
    throw new AuthenticationError(
      'Claude quota API rejected the token. Re-run `claude auth login` then `claude-usage login`.'
    )
  }

  if (response.status === 429) {
    const retryAfter = response.headers.get('retry-after')
    const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : undefined
    throw new RateLimitError(
      'Claude quota API rate-limited this token. Wait and retry, or use --method local.',
      Number.isFinite(retryAfterMs) ? retryAfterMs : undefined
    )
  }

  if (!response.ok) {
    throw new APIError(`Claude quota API returned HTTP ${response.status}`, response.status)
  }

  try {
    return JSON.parse(raw) as OauthUsageResponse
  } catch {
    throw new APIError('Claude quota API returned invalid JSON', response.status)
  }
}

export function parseOauthUsageSnapshot(
  response: OauthUsageResponse,
  email?: string,
  planType?: string
): QuotaSnapshot {
  const models: ModelQuotaInfo[] = []

  if (Array.isArray(response.limits) && response.limits.length > 0) {
    for (const limit of response.limits) {
      const parsed = structuredLimitToModel(limit)
      if (parsed) models.push(parsed)
    }
  }

  if (models.length === 0) {
    pushWindow(models, 'session', 'Session', response.five_hour, 'session')
    pushWindow(models, 'weekly', 'Week (all models)', response.seven_day, 'weekly')
    pushWindow(models, 'weekly-sonnet', 'Week (Sonnet)', response.seven_day_sonnet, 'weekly_scoped')
    pushWindow(models, 'weekly-opus', 'Week (Opus)', response.seven_day_opus, 'weekly_scoped')
  }

  debug('usage-api', `Parsed ${models.length} quota windows`)

  return {
    timestamp: new Date().toISOString(),
    method: 'cloud',
    email,
    planType,
    promptCredits: parseExtraUsage(response.extra_usage),
    models,
    notes: [
      'Cloud quota uses Anthropic GET /api/oauth/usage (the same surface Claude Code /usage uses). It is undocumented and may change.'
    ]
  }
}

function structuredLimitToModel(limit: StructuredLimit): ModelQuotaInfo | null {
  const utilization = limit.percent ?? limit.utilization
  if (utilization == null || Number.isNaN(Number(utilization))) {
    return null
  }

  const kind = mapLimitKind(limit.kind)
  const scopedName = limit.scope?.model?.display_name || limit.scope?.model?.name
  const label = kind === 'weekly_scoped' && scopedName
    ? `Week (${scopedName})`
    : kind === 'weekly'
      ? 'Week (all models)'
      : kind === 'session'
        ? 'Session'
        : scopedName || limit.kind || 'Limit'

  const modelId = kind === 'weekly_scoped' && scopedName
    ? `weekly-${scopedName.toLowerCase().replace(/\s+/g, '-')}`
    : kind === 'weekly'
      ? 'weekly'
      : kind === 'session'
        ? 'session'
        : (limit.kind || 'limit')

  return windowToModel(modelId, label, { utilization: Number(utilization), resets_at: limit.resets_at }, kind)
}

function mapLimitKind(kind?: string): ModelQuotaInfo['windowKind'] {
  switch (kind) {
    case 'session':
    case 'five_hour':
      return 'session'
    case 'weekly_all':
    case 'seven_day':
      return 'weekly'
    case 'weekly_scoped':
      return 'weekly_scoped'
    default:
      return 'other'
  }
}

function pushWindow(
  models: ModelQuotaInfo[],
  id: string,
  label: string,
  window: UsageWindow | null | undefined,
  kind: ModelQuotaInfo['windowKind']
): void {
  const model = windowToModel(id, label, window, kind)
  if (model) models.push(model)
}

function windowToModel(
  id: string,
  label: string,
  window: UsageWindow | null | undefined,
  kind: ModelQuotaInfo['windowKind']
): ModelQuotaInfo | null {
  if (!window || window.utilization == null) {
    return null
  }

  const remainingFraction = Math.max(0, (100 - window.utilization) / 100)
  return {
    label,
    modelId: id,
    remainingPercentage: remainingFraction,
    isExhausted: window.utilization >= 100,
    resetTime: window.resets_at ?? undefined,
    timeUntilResetMs: parseResetTime(window.resets_at),
    windowKind: kind
  }
}

export function parseResetTime(resetTime?: string | null): number | undefined {
  if (!resetTime) return undefined

  try {
    const asNumber = Number(resetTime)
    const resetDate = Number.isFinite(asNumber) && asNumber > 1e9
      ? new Date(asNumber < 1e11 ? asNumber * 1000 : asNumber)
      : new Date(resetTime)
    const diff = resetDate.getTime() - Date.now()
    return diff > 0 ? diff : undefined
  } catch {
    return undefined
  }
}

function parseExtraUsage(extra?: ExtraUsage | null): PromptCreditsInfo | undefined {
  if (!extra?.is_enabled) {
    return undefined
  }

  const monthly = extra.monthly_limit
  const used = extra.used_credits ?? 0
  if (monthly == null) {
    return undefined
  }

  const available = Math.max(0, monthly - used)
  return {
    available,
    monthly,
    usedPercentage: monthly === 0 ? 0 : used / monthly,
    remainingPercentage: monthly === 0 ? 0 : available / monthly
  }
}
