/**
 * @jest-environment node
 */
import { GET, POST } from './route'
import { DELETE, PATCH } from './[id]/route'
import { GET as GET_NOTIFICATIONS } from '../notifications/route'
import { POST as MARK_READ } from '../notifications/read/route'
import { getCurrentUser } from '@/lib/portal/auth'
import { isAdminUser } from '@/app/admin/data'
import * as store from '@/lib/searchAlerts/store'
import { fetchAnalyticsGatewayJson } from '@/lib/clickhouseGateway'

jest.mock('@/lib/portal/auth', () => ({ getCurrentUser: jest.fn() }))
jest.mock('@/app/admin/data', () => ({ isAdminUser: jest.fn() }))
jest.mock('@/lib/clickhouseGateway', () => ({
  fetchAnalyticsGatewayJson: jest.fn(),
}))
jest.mock('@/lib/searchAlerts/store', () => ({
  listSearchAlerts: jest.fn(),
  createSearchAlert: jest.fn(),
  updateSearchAlert: jest.fn(),
  deleteSearchAlert: jest.fn(),
  listNotifications: jest.fn(),
  countUnreadNotifications: jest.fn(),
  markNotificationsRead: jest.fn(),
}))

const ID = '6f1c1d36-2f7e-4c55-9d46-1a6b1b8b2a10'
const params = { params: Promise.resolve({ id: ID }) }
const json = (body: unknown, method = 'POST') =>
  new Request('https://example.org/api/x', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

const everyRoute = () => [
  GET(),
  POST(json({ query: 'community archive' })),
  PATCH(json({ emailEnabled: true }, 'PATCH'), params),
  DELETE(
    new Request('https://example.org/api/x', { method: 'DELETE' }),
    params,
  ),
  GET_NOTIFICATIONS(new Request('https://example.org/api/notifications')),
  MARK_READ(json({ all: true })),
]

const expectNoWork = () => {
  for (const fn of Object.values(store).filter(
    (value) => typeof value === 'function',
  ))
    expect(fn).not.toHaveBeenCalled()
  expect(fetchAnalyticsGatewayJson).not.toHaveBeenCalled()
}

beforeEach(() => jest.clearAllMocks())

test('signed-out requests get 401 and touch neither the database nor the gateway', async () => {
  jest.mocked(getCurrentUser).mockResolvedValue(null)
  for (const response of await Promise.all(everyRoute())) {
    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  }
  expectNoWork()
})

test('signed-in non-admins get 403 and touch neither the database nor the gateway', async () => {
  jest.mocked(getCurrentUser).mockResolvedValue({ id: 'u' } as never)
  jest.mocked(isAdminUser).mockReturnValue(false)
  for (const response of await Promise.all(everyRoute())) {
    expect(response.status).toBe(403)
  }
  expectNoWork()
})

describe('as an admin', () => {
  beforeEach(() => {
    jest.mocked(getCurrentUser).mockResolvedValue({ id: 'admin' } as never)
    jest.mocked(isAdminUser).mockReturnValue(true)
  })

  test('creates an alert for the signed-in user', async () => {
    jest.mocked(store.createSearchAlert).mockResolvedValue({
      ok: true,
      created: true,
      alert: { id: ID } as never,
    })
    const response = await POST(
      json({ query: '"Community Archive"', emailEnabled: true }),
    )
    expect(response.status).toBe(201)
    expect(store.createSearchAlert).toHaveBeenCalledWith('admin', {
      query: 'Community Archive',
      mode: 'phrase',
      fromUser: null,
      emailEnabled: true,
    })
  })

  test('the eleventh alert is refused with 409', async () => {
    jest
      .mocked(store.createSearchAlert)
      .mockResolvedValue({ ok: false, reason: 'cap' })
    const response = await POST(json({ query: 'one more' }))
    expect(response.status).toBe(409)
    expect((await response.json()).error).toMatch(/up to 10/)
  })

  test('invalid input is a 400 without a write', async () => {
    expect((await POST(json({ query: '' }))).status).toBe(400)
    expect(
      (await PATCH(json({ emailEnabled: 'yes' }, 'PATCH'), params)).status,
    ).toBe(400)
    expect(
      (
        await PATCH(json({ emailEnabled: true }, 'PATCH'), {
          params: Promise.resolve({ id: 'nope' }),
        })
      ).status,
    ).toBe(404)
    expect((await MARK_READ(json({ ids: ['x'] }))).status).toBe(400)
    expectNoWork()
  })

  test('updates, deletes and reports missing alerts as 404', async () => {
    jest.mocked(store.updateSearchAlert).mockResolvedValue(null)
    expect(
      (await PATCH(json({ emailEnabled: true }, 'PATCH'), params)).status,
    ).toBe(404)
    jest.mocked(store.deleteSearchAlert).mockResolvedValue(true)
    const deleted = await DELETE(
      new Request('https://example.org/api/x', { method: 'DELETE' }),
      params,
    )
    expect(deleted.status).toBe(200)
    expect(store.deleteSearchAlert).toHaveBeenCalledWith('admin', ID)
  })

  test('the bell count is one head-only count query', async () => {
    jest.mocked(store.countUnreadNotifications).mockResolvedValue(3)
    const response = await GET_NOTIFICATIONS(
      new Request('https://example.org/api/notifications?view=count'),
    )
    expect(await response.json()).toEqual({ unreadCount: 3 })
    expect(store.listNotifications).not.toHaveBeenCalled()
  })

  test('marks the given notifications read', async () => {
    jest.mocked(store.markNotificationsRead).mockResolvedValue(1)
    const response = await MARK_READ(json({ ids: [ID] }))
    expect(await response.json()).toEqual({ updated: 1 })
    expect(store.markNotificationsRead).toHaveBeenCalledWith('admin', [ID])
  })
})
