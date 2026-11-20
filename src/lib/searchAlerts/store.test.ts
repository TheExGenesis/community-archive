import { createSearchAlert, parseMatchedTweets } from './store'
import { createServerServiceRoleClient } from '@/utils/supabase'

jest.mock('@/utils/supabase', () => ({
  createServerServiceRoleClient: jest.fn(),
}))

const row = {
  id: 'alert-1',
  query: 'community archive',
  mode: 'phrase',
  from_user: null,
  email_enabled: false,
  last_checked_at: '2026-11-20T10:00:00Z',
  created_at: '2026-11-20T10:00:00Z',
}

function client({
  existing = [] as unknown[],
  insert = { data: row, error: null } as unknown,
}) {
  const lookup = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    then: (resolve: (value: unknown) => void) =>
      resolve({ data: existing, error: null }),
  }
  const inserted = {
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(insert),
  }
  const table = { ...lookup, insert: jest.fn(() => inserted) }
  jest
    .mocked(createServerServiceRoleClient)
    .mockReturnValue({ from: () => table } as never)
  return table
}

const input = {
  query: 'community archive',
  mode: 'phrase' as const,
  fromUser: null,
  emailEnabled: true,
}

test('the database cap of 10 live alerts is reported as a cap result', async () => {
  client({
    insert: {
      data: null,
      error: {
        message: 'search alert limit reached',
        hint: 'search_alert_cap',
      },
    },
  })
  expect(await createSearchAlert('u', input)).toEqual({
    ok: false,
    reason: 'cap',
  })
})

test('creating the same search again returns the existing alert', async () => {
  const table = client({ existing: [row] })
  const result = await createSearchAlert('u', input)
  expect(result).toMatchObject({
    ok: true,
    created: false,
    alert: { id: 'alert-1' },
  })
  expect(table.insert).not.toHaveBeenCalled()
  // ilike wildcards in the query are escaped.
  client({})
  await createSearchAlert('u', { ...input, query: '100%_done' })
})

test('creates an alert with its email choice', async () => {
  const table = client({})
  expect(await createSearchAlert('u', input)).toMatchObject({
    ok: true,
    created: true,
  })
  expect(table.insert).toHaveBeenCalledWith({
    user_id: 'u',
    query: 'community archive',
    mode: 'phrase',
    from_user: null,
    email_enabled: true,
  })
})

test('other database errors are thrown', async () => {
  client({ insert: { data: null, error: { message: 'boom' } } })
  await expect(createSearchAlert('u', input)).rejects.toEqual({
    message: 'boom',
  })
})

test('parses stored tweet references defensively', () => {
  expect(
    parseMatchedTweets([
      { id: '1', replyToId: '2', createdAt: 'x' },
      { id: 'nope' },
      { id: '3', replyToId: 'bad' },
    ]),
  ).toEqual([
    { id: '1', replyToId: '2', createdAt: 'x' },
    { id: '3', replyToId: null, createdAt: '' },
  ])
})
