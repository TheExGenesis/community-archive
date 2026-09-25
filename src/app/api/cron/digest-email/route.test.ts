import { POST } from './route'
import { mapDigestEdition } from '@/lib/digest/data'
import { isAuthorizedDigestCronRequest } from '@/lib/digest/cron'
import {
  listUnsentRecipients,
  recordSend,
} from '@/lib/digest/emailSubscriptions'
import { prepareDigestBulletinItems } from '@/lib/digest/bulletin'
import { renderDigestEmail } from '@/lib/digest/emailTemplate'
import { sendEmail } from '@/lib/email'
import { createServerServiceRoleClient } from '@/utils/supabase'
import { AUGUST_11_MOCK_DIGEST } from '@/lib/digest/mock'

jest.mock('@/lib/digest/data', () => ({ mapDigestEdition: jest.fn() }))
jest.mock('@/lib/digest/cron', () => ({
  isAuthorizedDigestCronRequest: jest.fn(),
}))
jest.mock('@/lib/digest/emailSubscriptions', () => ({
  listUnsentRecipients: jest.fn(),
  recordSend: jest.fn(),
}))
jest.mock('@/lib/digest/bulletin', () => ({
  prepareDigestBulletinItems: jest.fn(),
}))
jest.mock('@/lib/digest/emailTemplate', () => ({
  renderDigestEmail: jest.fn(),
}))
jest.mock('@/lib/email', () => ({ sendEmail: jest.fn() }))
jest.mock('@/utils/supabase', () => ({
  createServerServiceRoleClient: jest.fn(),
}))

test('renders each email with its subscriber account recommendations', async () => {
  const query = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest
      .fn()
      .mockResolvedValue({ data: { id: 'edition' }, error: null }),
  }
  jest
    .mocked(createServerServiceRoleClient)
    .mockReturnValue({ from: () => query } as never)
  jest.mocked(isAuthorizedDigestCronRequest).mockReturnValue(true)
  jest.mocked(mapDigestEdition).mockReturnValue(AUGUST_11_MOCK_DIGEST)
  jest.mocked(listUnsentRecipients).mockResolvedValue([
    {
      id: 'linked',
      email: 'linked@example.com',
      token: 'token-1',
      accountId: '42',
      confirmedAt: 'now',
      unsubscribedAt: null,
    },
    {
      id: 'guest',
      email: 'guest@example.com',
      token: 'token-2',
      accountId: null,
      confirmedAt: 'now',
      unsubscribedAt: null,
    },
  ])
  const itemsForAccount = jest.fn(async (accountId?: string | null) => [
    {
      label: 'Help wanted',
      summary: accountId ?? 'guest',
      tweet: { id: accountId ?? 'guest' },
    },
  ])
  jest
    .mocked(prepareDigestBulletinItems)
    .mockResolvedValue({ itemsForAccount } as never)
  jest.mocked(renderDigestEmail).mockReturnValue({
    subject: 'Digest',
    html: '<p>Digest</p>',
    text: 'Digest',
  })
  jest.mocked(sendEmail).mockResolvedValue({ ok: true, id: 'message' })
  jest.mocked(recordSend).mockResolvedValue()

  const response = await POST(
    new Request('http://localhost/api/cron/digest-email', {
      method: 'POST',
      body: '{}',
    }),
  )

  expect(response.status).toBe(200)
  expect(itemsForAccount.mock.calls.map(([accountId]) => accountId)).toEqual([
    '42',
    null,
  ])
  expect(renderDigestEmail).toHaveBeenNthCalledWith(
    1,
    AUGUST_11_MOCK_DIGEST,
    expect.any(Object),
    expect.arrayContaining([expect.objectContaining({ summary: '42' })]),
    expect.objectContaining({ personalizedBulletin: true }),
  )
  expect(renderDigestEmail).toHaveBeenNthCalledWith(
    2,
    AUGUST_11_MOCK_DIGEST,
    expect.any(Object),
    expect.arrayContaining([expect.objectContaining({ summary: 'guest' })]),
    expect.objectContaining({ personalizedBulletin: false }),
  )
  expect(sendEmail).toHaveBeenCalledTimes(2)
  expect(recordSend).toHaveBeenCalledTimes(2)
})
