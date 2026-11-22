import { runSearchAlertEmails, type SearchAlertEmailDeps } from './emailRun'
import type { ClaimedAlertMatches } from './store'

const matches = (alertId: string, ids: string[]): ClaimedAlertMatches => ({
  alertId,
  query: `query ${alertId}`,
  mode: 'all',
  fromUser: null,
  count: ids.length,
  since: '2026-11-19T10:00:00.000Z',
  tweets: ids.map((id) => ({ id, replyToId: null, createdAt: '' })),
})

/** An in-memory ledger with the same claim semantics as the database. */
function ledger(unsent: Record<string, ClaimedAlertMatches[]>) {
  const claims = new Map<string, { userId: string; sent: boolean }>()
  let next = 0
  return {
    claims,
    claim: jest.fn(async (userId: string) => {
      const owned = Array.from(claims.values()).some(
        (claim) => claim.userId === userId,
      )
      if (owned || !unsent[userId]?.length) return null
      const id = `send-${++next}`
      claims.set(id, { userId, sent: false })
      return id
    }),
    load: jest.fn(async (sendId: string) => ({
      unsubscribeToken: `token-${sendId}`,
      alerts: unsent[claims.get(sendId)!.userId],
    })),
    complete: jest.fn(async (sendId: string) => {
      claims.get(sendId)!.sent = true
    }),
    release: jest.fn(async (sendId: string) => {
      claims.delete(sendId)
    }),
  }
}

const baseDeps = (
  store: ReturnType<typeof ledger>,
  overrides: Partial<SearchAlertEmailDeps> = {},
) => ({
  listUsers: async () => ['u1', 'u2'],
  userEmail: async (userId: string) => `${userId}@example.com`,
  tweetCards: jest.fn(
    async (ids: string[]) =>
      new Map(
        ids.map((id) => [
          id,
          {
            id,
            username: 'someone',
            name: 'Someone',
            avatar: null,
            text: `tweet ${id}`,
            createdAt: '2026-11-20T00:00:00Z',
            observedAt: '2026-11-20T00:00:00Z',
            likes: 1,
            rts: 0,
          },
        ]),
      ),
  ),
  send: jest.fn(async () => ({ ok: true as const, id: 'msg' })),
  links: {
    siteUrl: 'https://example.org',
    settingsUrl: 'https://example.org/settings#search-alerts',
    unsubscribeUrl: (token: string) => `https://example.org/u?token=${token}`,
  },
  sleep: async () => undefined,
  ...store,
  ...overrides,
})

test('sends one roll-up per user covering all their alerts, with one-click unsubscribe', async () => {
  const store = ledger({
    u1: [matches('a', ['1', '2', '3', '4']), matches('b', ['5'])],
    u2: [matches('c', ['6'])],
  })
  const deps = baseDeps(store)
  const result = await runSearchAlertEmails(deps)

  expect(result).toEqual({ users: 2, sent: 2, skipped: 0, failed: 0 })
  expect(deps.send).toHaveBeenCalledTimes(2)
  const first = jest.mocked(deps.send).mock.calls[0][0] as unknown as {
    to: string
    subject: string
    html: string
    headers: Record<string, string>
  }
  expect(first.to).toBe('u1@example.com')
  expect(first.subject).toBe('5 new matches across 2 search alerts')
  expect(first.html).toContain('query a')
  expect(first.html).toContain('query b')
  expect(first.headers['List-Unsubscribe']).toBe(
    '<https://example.org/u?token=token-send-1>',
  )
  expect(first.headers['List-Unsubscribe-Post']).toBe(
    'List-Unsubscribe=One-Click',
  )
  // Three tweets per alert at most are hydrated for the email.
  expect(jest.mocked(deps.tweetCards).mock.calls[0][0]).toEqual([
    '1',
    '2',
    '3',
    '5',
  ])
  expect(store.complete).toHaveBeenCalledWith('send-1', 'msg')
})

test('the ledger stops a second run from sending the same matches again', async () => {
  const store = ledger({ u1: [matches('a', ['1'])] })
  const deps = baseDeps(store, { listUsers: async () => ['u1'] })
  await runSearchAlertEmails(deps)
  const again = await runSearchAlertEmails(deps)

  expect(deps.send).toHaveBeenCalledTimes(1)
  expect(again).toEqual({ users: 1, sent: 0, skipped: 1, failed: 0 })
})

test('sends nothing when nothing is new', async () => {
  const store = ledger({})
  const deps = baseDeps(store)
  const result = await runSearchAlertEmails(deps)
  expect(deps.send).not.toHaveBeenCalled()
  expect(result.sent).toBe(0)
})

test('a failed send releases its claim so the matches go out next time', async () => {
  const store = ledger({ u1: [matches('a', ['1'])] })
  const send = jest
    .fn()
    .mockResolvedValueOnce({ ok: false, error: 'rate limited' })
    .mockResolvedValue({ ok: true, id: 'msg-2' })
  const deps = baseDeps(store, { listUsers: async () => ['u1'], send })
  jest.spyOn(console, 'error').mockImplementation(() => undefined)

  expect(await runSearchAlertEmails(deps)).toMatchObject({ sent: 0, failed: 1 })
  expect(store.release).toHaveBeenCalledWith('send-1')
  expect(await runSearchAlertEmails(deps)).toMatchObject({ sent: 1 })
  expect(send).toHaveBeenCalledTimes(2)
})

test('skips accounts without an email address before claiming anything', async () => {
  const store = ledger({ u1: [matches('a', ['1'])] })
  const deps = baseDeps(store, {
    listUsers: async () => ['u1'],
    userEmail: async () => null,
  })
  expect(await runSearchAlertEmails(deps)).toMatchObject({ skipped: 1 })
  expect(store.claim).not.toHaveBeenCalled()
})
