import { getCurrentUser } from '@/lib/portal/auth'
import { getOptInStatus } from '@/lib/auth-utils'
import { canReadTweetConversation } from './tweetConversationAccess'

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  cache: (fn: unknown) => fn,
}))
jest.mock('@/lib/portal/auth', () => ({ getCurrentUser: jest.fn() }))
jest.mock('@/lib/auth-utils', () => ({ getOptInStatus: jest.fn() }))

beforeEach(() => jest.resetAllMocks())

test.each([null, { id: '1', is_anonymous: true }])(
  'guests cannot read conversations: %j',
  async (user) => {
    ;(getCurrentUser as jest.Mock).mockResolvedValue(user)
    expect(await canReadTweetConversation()).toBe(false)
    expect(getOptInStatus).not.toHaveBeenCalled()
  },
)

test.each([
  [null, null, false],
  [{ opted_in: false }, null, false],
  [{ opted_in: true, explicit_optout: true }, null, false],
  [{ opted_in: true, explicit_optout: false }, null, true],
  [{ opted_in: true }, { message: 'unavailable' }, false],
])('uses live consent and fails closed: %j', async (data, error, allowed) => {
  ;(getCurrentUser as jest.Mock).mockResolvedValue({ id: '1' })
  ;(getOptInStatus as jest.Mock).mockResolvedValue({ data, error })
  expect(await canReadTweetConversation()).toBe(allowed)
  expect(getOptInStatus).toHaveBeenCalledWith('1')
})

test('a consent lookup failure keeps the preview locked', async () => {
  ;(getCurrentUser as jest.Mock).mockRejectedValue(new Error('unavailable'))
  expect(await canReadTweetConversation()).toBe(false)
})
