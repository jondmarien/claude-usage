import { describe, it, expect } from 'vitest'
import { parseOauthUsageSnapshot, parseResetTime } from '../../src/claude/usage-api.js'

describe('parseOauthUsageSnapshot', () => {
  it('parses flat five_hour / seven_day windows', () => {
    const snapshot = parseOauthUsageSnapshot({
      five_hour: { utilization: 25, resets_at: new Date(Date.now() + 4 * 3600_000).toISOString() },
      seven_day: { utilization: 10, resets_at: new Date(Date.now() + 6 * 24 * 3600_000).toISOString() },
      seven_day_sonnet: { utilization: 40, resets_at: new Date(Date.now() + 2 * 24 * 3600_000).toISOString() },
      extra_usage: { is_enabled: true, monthly_limit: 1000, used_credits: 100 }
    }, 'user@example.com', 'max')

    expect(snapshot.method).toBe('cloud')
    expect(snapshot.email).toBe('user@example.com')
    expect(snapshot.planType).toBe('max')
    expect(snapshot.models.map(m => m.modelId)).toEqual(['session', 'weekly', 'weekly-sonnet'])
    expect(snapshot.models[0].remainingPercentage).toBeCloseTo(0.75)
    expect(snapshot.models[0].windowKind).toBe('session')
    expect(snapshot.promptCredits?.available).toBe(900)
    expect(snapshot.notes?.length).toBeGreaterThan(0)
  })

  it('prefers structured limits array when present', () => {
    const snapshot = parseOauthUsageSnapshot({
      five_hour: { utilization: 99, resets_at: '2026-01-01T00:00:00Z' },
      limits: [
        { kind: 'session', percent: 12, resets_at: '2026-09-04T12:00:00Z' },
        { kind: 'weekly_all', percent: 8, resets_at: '2026-09-10T12:00:00Z' },
        { kind: 'weekly_scoped', percent: 33, resets_at: '2026-09-08T12:00:00Z', scope: { model: { display_name: 'Sonnet' } } }
      ]
    })

    expect(snapshot.models).toHaveLength(3)
    expect(snapshot.models[0].label).toBe('Session')
    expect(snapshot.models[1].label).toBe('Week (all models)')
    expect(snapshot.models[2].label).toBe('Week (Sonnet)')
    expect(snapshot.models[2].modelId).toBe('weekly-sonnet')
  })

  it('falls back to flat windows when limits cannot be parsed', () => {
    const snapshot = parseOauthUsageSnapshot({
      limits: [{ kind: 'unknown' }],
      five_hour: { utilization: 20, resets_at: '2026-09-04T12:00:00Z' }
    })
    expect(snapshot.models).toHaveLength(1)
    expect(snapshot.models[0].modelId).toBe('session')
    expect(snapshot.models[0].remainingPercentage).toBeCloseTo(0.8)
  })

  it('skips null windows', () => {
    const snapshot = parseOauthUsageSnapshot({
      five_hour: null,
      seven_day: { utilization: 5, resets_at: '2026-09-10T00:00:00Z' }
    })
    expect(snapshot.models).toHaveLength(1)
    expect(snapshot.models[0].modelId).toBe('weekly')
  })
})

describe('parseResetTime', () => {
  it('handles ISO timestamps', () => {
    const ms = parseResetTime(new Date(Date.now() + 3600_000).toISOString())
    expect(ms).toBeGreaterThan(3_000_000)
  })

  it('handles unix seconds', () => {
    const ms = parseResetTime(String(Math.floor(Date.now() / 1000) + 7200))
    expect(ms).toBeGreaterThan(3_000_000)
  })
})
