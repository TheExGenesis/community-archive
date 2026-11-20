/**
 * @jest-environment node
 */
import { GET } from './route'
import { GET as SEND } from '../search-alerts-email/route'
import { runSearchAlertChecks } from '@/lib/searchAlerts/matcher'
import { runSearchAlertEmails } from '@/lib/searchAlerts/emailRun'
import { pruneSearchAlertMatches } from '@/lib/searchAlerts/store'

jest.mock('@/lib/searchAlerts/matcher', () => ({
  runSearchAlertChecks: jest.fn(),
}))
jest.mock('@/lib/searchAlerts/emailRun', () => ({
  runSearchAlertEmails: jest.fn(),
}))
jest.mock('@/lib/searchAlerts/store', () => ({
  listCheckableAlerts: jest.fn(),
  recordSearchAlertCheck: jest.fn(),
  recordSearchAlertFailure: jest.fn(),
  pruneSearchAlertMatches: jest.fn(async () => undefined),
  claimSearchAlertEmail: jest.fn(),
  completeSearchAlertEmail: jest.fn(),
  getUserEmail: jest.fn(),
  listSearchAlertEmailUsers: jest.fn(),
  loadClaimedMatches: jest.fn(),
  releaseSearchAlertEmail: jest.fn(),
}))
jest.mock('@/lib/email', () => ({ sendEmail: jest.fn() }))
jest.mock('@/lib/digest/emailLinks', () => ({
  digestEmailSiteUrl: () => 'https://example.org',
}))
jest.mock('@/lib/searchAlerts/emailLinks', () => ({
  searchAlertSettingsUrl: () => 'https://example.org/settings',
  searchAlertUnsubscribeUrl: (t: string) => `https://example.org/u?token=${t}`,
}))

const cron = (secret?: string) =>
  new Request('https://example.org/api/cron/search-alerts', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  })

const result = {
  alerts: 2,
  searches: 1,
  deferredSearches: 0,
  failedSearches: 0,
  alertsWithMatches: 1,
  newMatches: 4,
  failedAlerts: 0,
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.CRON_SECRET = 'secret'
  process.env.ENABLE_CLICKHOUSE_READS = 'true'
})

test('both crons refuse requests without the cron secret', async () => {
  expect((await GET(cron())).status).toBe(401)
  expect((await GET(cron('wrong'))).status).toBe(401)
  expect((await SEND(cron())).status).toBe(401)
  expect(runSearchAlertChecks).not.toHaveBeenCalled()
  expect(runSearchAlertEmails).not.toHaveBeenCalled()
})

test('the matching cron runs a pass and prunes the match log', async () => {
  jest.mocked(runSearchAlertChecks).mockResolvedValue(result)
  const response = await GET(cron('secret'))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual(result)
  expect(pruneSearchAlertMatches).toHaveBeenCalled()
})

test('the matching cron reports a 502 when every search failed', async () => {
  jest
    .mocked(runSearchAlertChecks)
    .mockResolvedValue({ ...result, failedSearches: 1 })
  expect((await GET(cron('secret'))).status).toBe(502)
})

test('the matching cron does nothing while ClickHouse reads are off', async () => {
  process.env.ENABLE_CLICKHOUSE_READS = 'false'
  expect((await GET(cron('secret'))).status).toBe(503)
  expect(runSearchAlertChecks).not.toHaveBeenCalled()
})

test('the email cron runs the daily roll-up', async () => {
  jest
    .mocked(runSearchAlertEmails)
    .mockResolvedValue({ users: 1, sent: 1, skipped: 0, failed: 0 })
  const response = await SEND(cron('secret'))
  expect(await response.json()).toEqual({
    users: 1,
    sent: 1,
    skipped: 0,
    failed: 0,
  })
})
