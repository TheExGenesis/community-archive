import {
  MAX_AGGREGATE_RANGE_MS,
  getStatsRangeLimitMs,
  isTwitterUsername,
  validateDateRange,
} from './apiInputValidation'

describe('API input validation', () => {
  it('accepts Twitter handles and rejects oversized or structural input', () => {
    expect(isTwitterUsername('user_123')).toBe(true)
    expect(isTwitterUsername('a'.repeat(15))).toBe(true)
    expect(isTwitterUsername('a'.repeat(16))).toBe(false)
    expect(isTwitterUsername('../archive')).toBe(false)
    expect(isTwitterUsername('')).toBe(false)
  })

  it('validates ordering and maximum date range', () => {
    expect(
      validateDateRange(
        '2026-01-01T00:00:00Z',
        '2026-01-02T00:00:00Z',
        MAX_AGGREGATE_RANGE_MS,
      ),
    ).toMatchObject({ ok: true })
    expect(
      validateDateRange('invalid', '2026-01-02', MAX_AGGREGATE_RANGE_MS),
    ).toEqual({ ok: false, error: 'invalid' })
    expect(
      validateDateRange('2026-01-02', '2026-01-01', MAX_AGGREGATE_RANGE_MS),
    ).toEqual({ ok: false, error: 'order' })
    expect(
      validateDateRange('2024-01-01', '2026-01-01', MAX_AGGREGATE_RANGE_MS),
    ).toEqual({ ok: false, error: 'range' })
  })

  it('uses a tighter range for minute-level statistics', () => {
    expect(getStatsRangeLimitMs('minute')).toBe(7 * 24 * 60 * 60 * 1000)
    expect(getStatsRangeLimitMs('hour')).toBe(MAX_AGGREGATE_RANGE_MS)
    expect(getStatsRangeLimitMs('invalid')).toBeNull()
  })
})
