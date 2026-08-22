import {
  isAuthorizedDigestCronRequest,
  isNightlyDigestAutomationEnabled,
  resolveDigestAutomationDate,
} from './cron'

describe('nightly digest cron gate', () => {
  test('requires the exact configured bearer secret', () => {
    expect(
      isAuthorizedDigestCronRequest(
        new Request('https://example.test/api/cron/daily-digest', {
          headers: { authorization: 'Bearer expected-secret' },
        }),
        'expected-secret',
      ),
    ).toBe(true)
    expect(
      isAuthorizedDigestCronRequest(
        new Request('https://example.test/api/cron/daily-digest', {
          headers: { authorization: 'Bearer wrong-secret' },
        }),
        'expected-secret',
      ),
    ).toBe(false)
    expect(
      isAuthorizedDigestCronRequest(
        new Request('https://example.test/api/cron/daily-digest'),
        undefined,
      ),
    ).toBe(false)
  })

  test('requires an explicit production enable flag', () => {
    expect(isNightlyDigestAutomationEnabled('true')).toBe(true)
    expect(isNightlyDigestAutomationEnabled('false')).toBe(false)
    expect(isNightlyDigestAutomationEnabled(undefined)).toBe(false)
  })

  test('uses the latest completed date for the scheduled request', () => {
    expect(
      resolveDigestAutomationDate(
        undefined,
        new Date('2026-08-21T07:00:00.000Z'),
      ),
    ).toBe('2026-08-20')
  })

  test('accepts only a recent completed date for supervised recovery', () => {
    const now = new Date('2026-08-21T07:00:00.000Z')
    expect(resolveDigestAutomationDate('2026-08-19', now)).toBe('2026-08-19')
    expect(() => resolveDigestAutomationDate('2026-08-21', now)).toThrow(
      'within the last 30 completed days',
    )
    expect(() => resolveDigestAutomationDate('not-a-date', now)).toThrow(
      'within the last 30 completed days',
    )
  })
})
