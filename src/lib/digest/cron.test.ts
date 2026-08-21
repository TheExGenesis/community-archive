import {
  isAuthorizedDigestCronRequest,
  isNightlyDigestAutomationEnabled,
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
})
