import { getUserDirectoryPage } from './userDirectory'
import { getHiddenDirectoryUsers } from './directoryVisibility'

jest.mock('./directoryVisibility', () => ({
  ...jest.requireActual('./directoryVisibility'),
  getHiddenDirectoryUsers: jest.fn().mockResolvedValue([]),
}))

describe('getUserDirectoryPage', () => {
  test('maps the ClickHouse gateway response into directory users', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      data: {
        users: [
          {
            directoryId: 'id:42',
            accountId: '42',
            username: 'alice',
            displayName: 'Alice',
            avatarUrl: 'https://pbs.twimg.com/alice.jpg',
            followerCount: '1234',
            joinedAt: '2026-08-01T00:00:00.000Z',
            hasArchive: true,
            isOptedIn: false,
          },
        ],
      },
      pagination: { hasMore: true },
    })
    const params = new URLSearchParams({ limit: '15', offset: '30' })

    await expect(getUserDirectoryPage(params, fetcher)).resolves.toEqual({
      users: [
        {
          directory_id: 'id:42',
          account_id: '42',
          username: 'alice',
          account_display_name: 'Alice',
          avatar_media_url: 'https://pbs.twimg.com/alice.jpg',
          num_followers: 1234,
          has_archive: true,
          is_opted_in: false,
          opted_in_at: null,
          archive_uploaded_at: null,
          joined_at: '2026-08-01T00:00:00.000Z',
        },
      ],
      hasMore: true,
      nextOffset: 31,
    })
    expect(fetcher).toHaveBeenCalledWith(['member-directory'], params, {
      revalidate: 30,
      timeoutMs: 8_000,
    })
  })
})

const row = (id: number) => ({
  directoryId: `id:${id}`,
  accountId: String(id),
  username: `member_${id}`,
  displayName: `Member ${id}`,
  avatarUrl: null,
  followerCount: 1,
  joinedAt: null,
  hasArchive: true,
  isOptedIn: false,
})
const hidden = (id: number) => ({
  visibility_key: `id:${id}`,
  account_id: String(id),
  username: `member_${id}`,
  hidden_by: null,
  hidden_at: '2026-10-29',
})

test('filters before returning rows, retaining a source cursor across pages', async () => {
  const source = [row(1), row(2), row(3), row(4), row(5)]
  const fetcher = jest.fn().mockImplementation(async (_path, params) => {
    const offset = Number(params.get('offset') || 0)
    const limit = Number(params.get('limit'))
    return {
      data: { users: source.slice(offset, offset + limit) },
      pagination: { hasMore: offset + limit < source.length },
    }
  })
  const hiddenRows = Promise.resolve([hidden(1), hidden(3)])
  const first = await getUserDirectoryPage(
    new URLSearchParams({ limit: '2' }),
    fetcher,
    hiddenRows,
  )
  expect(first.users.map((user) => user.account_id)).toEqual(['2', '4'])
  expect(first).toMatchObject({ nextOffset: 4, hasMore: true })
  const second = await getUserDirectoryPage(
    new URLSearchParams({ limit: '2', offset: '4' }),
    fetcher,
    hiddenRows,
  )
  expect(second.users.map((user) => user.account_id)).toEqual(['5'])
  expect(second).toMatchObject({ nextOffset: 5, hasMore: false })
})

test('hiding follows stable account identity after a rename', async () => {
  const fetcher = jest.fn().mockResolvedValue({
    data: { users: [{ ...row(1), username: 'renamed' }] },
    pagination: { hasMore: false },
  })
  const result = await getUserDirectoryPage(
    undefined,
    fetcher,
    Promise.resolve([hidden(1)]),
  )
  expect(result).toEqual({ users: [], nextOffset: 1, hasMore: false })
})

test('an entirely hidden source page still advances the cursor', async () => {
  const rows = Array.from({ length: 100 }, (_, i) => row(i + 1))
  const fetcher = jest
    .fn()
    .mockResolvedValue({ data: { users: rows }, pagination: { hasMore: true } })
  const result = await getUserDirectoryPage(
    undefined,
    fetcher,
    Promise.resolve(rows.map((_, i) => hidden(i + 1))),
  )
  expect(result).toEqual({ users: [], nextOffset: 100, hasMore: true })
})

test('fails closed when visibility settings are unavailable', async () => {
  jest
    .mocked(getHiddenDirectoryUsers)
    .mockRejectedValueOnce(new Error('database unavailable'))
  const fetcher = jest.fn()
  await expect(getUserDirectoryPage(undefined, fetcher)).rejects.toThrow(
    'database unavailable',
  )
  expect(fetcher).not.toHaveBeenCalled()
})
