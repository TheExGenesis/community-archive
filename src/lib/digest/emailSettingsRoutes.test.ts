import { GET, POST } from '@/app/api/digest/email/settings/route'
import { POST as subscribe } from '@/app/api/digest/email/subscribe/route'
import { getAuthenticatedAccountId } from '@/lib/authenticatedAccount'
import {
  getSubscriptionForAccount,
  unsubscribe,
  upsertSubscription,
} from './emailSubscriptions'

jest.mock('@/lib/authenticatedAccount', () => ({
  getAuthenticatedAccountId: jest.fn(),
}))
jest.mock('./emailSubscriptions', () => ({
  ...jest.requireActual('./emailSubscriptions'),
  getSubscriptionForAccount: jest.fn(),
  unsubscribe: jest.fn(),
  upsertSubscription: jest.fn(),
}))

const subscription = {
  id: 'b4f865c8-f05a-4f86-975f-a2a6edfd3981',
  email: 'reader@example.com',
  token: 'private-token',
  accountId: '123',
  confirmedAt: '2026-09-15T10:00:00Z',
  unsubscribedAt: null,
}
const request = (body: unknown) =>
  new Request('http://localhost/api/digest/email/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getAuthenticatedAccountId).mockResolvedValue('123')
  jest.mocked(getSubscriptionForAccount).mockResolvedValue(subscription)
  jest.mocked(upsertSubscription).mockResolvedValue(subscription)
  jest.mocked(unsubscribe).mockResolvedValue(true)
})

test('returns private, uncached status with a masked email and no unsubscribe token', async () => {
  const response = await GET()
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(await response.json()).toEqual({
    id: subscription.id,
    status: 'subscribed',
    email: 're••••@example.com',
  })
})

test.each([
  null,
  { ...subscription, confirmedAt: null },
  { ...subscription, unsubscribedAt: '2026-09-15T11:00:00Z' },
])('does not mark an inactive subscription as subscribed', async (row) => {
  jest.mocked(getSubscriptionForAccount).mockResolvedValueOnce(row)
  expect((await (await GET()).json()).status).not.toBe('subscribed')
})

test('requires authentication for both status and unsubscribe', async () => {
  jest.mocked(getAuthenticatedAccountId).mockResolvedValue(null)
  expect((await GET()).status).toBe(401)
  expect((await POST(request({ action: 'unsubscribe' }))).status).toBe(401)
  expect(getSubscriptionForAccount).not.toHaveBeenCalled()
  expect(unsubscribe).not.toHaveBeenCalled()
})

test('resolves the chosen subscription against the authenticated account before unsubscribing', async () => {
  expect(
    (
      await POST(
        request({
          action: 'unsubscribe',
          subscriptionId: subscription.id,
          accountId: 'attacker',
        }),
      )
    ).status,
  ).toBe(200)
  expect(getSubscriptionForAccount).toHaveBeenCalledWith('123', subscription.id)
  expect(unsubscribe).toHaveBeenCalledWith(subscription.token)
})

test('does not unsubscribe when the id is not owned by the account', async () => {
  jest.mocked(getSubscriptionForAccount).mockResolvedValueOnce(null)
  await POST(
    request({ action: 'unsubscribe', subscriptionId: subscription.id }),
  )
  expect(unsubscribe).not.toHaveBeenCalled()
})

test('preserves the existing settings unsubscribe request without an id', async () => {
  expect((await POST(request({ action: 'unsubscribe' }))).status).toBe(200)
  expect(getSubscriptionForAccount).toHaveBeenCalledWith('123', undefined)
  expect(unsubscribe).toHaveBeenCalledWith(subscription.token)
})

test('rejects malformed subscription ids before querying', async () => {
  expect(
    (await POST(request({ action: 'unsubscribe', subscriptionId: 'invalid' })))
      .status,
  ).toBe(400)
  expect(getSubscriptionForAccount).not.toHaveBeenCalled()
  expect(unsubscribe).not.toHaveBeenCalled()
})

test.each([null, '456', '123'])(
  'only returns a manageable subscription id to its linked account (%s)',
  async (accountId) => {
    jest.mocked(getAuthenticatedAccountId).mockResolvedValue(accountId)
    const body = await (
      await subscribe(request({ email: subscription.email }))
    ).json()
    expect(body.subscriptionId).toBe(
      accountId === '123' ? subscription.id : null,
    )
    expect(body.token).toBeUndefined()
  },
)
