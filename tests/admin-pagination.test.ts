import { fetchOptInPage, type OptInRecord } from '@/app/admin/data'

const optInRecord = (index: number): OptInRecord => ({
  id: `optin-${String(index).padStart(3, '0')}`,
  user_id: null,
  username: `user_${index}`,
  twitter_user_id: String(index),
  opted_in: true,
  explicit_optout: false,
  opt_out_reason: null,
  created_at: '2026-08-11T00:00:00Z',
  updated_at: '2026-08-11T00:00:00Z',
  opted_in_at: '2026-08-11T00:00:00Z',
  opted_out_at: null,
})

function mockAdmin(rows: OptInRecord[]) {
  const query = {
    select: jest.fn(),
    order: jest.fn(),
    or: jest.fn(),
    is: jest.fn(),
    gt: jest.fn(),
    range: jest.fn(async (from: number, to: number) => ({
      data: rows.slice(from, to + 1),
      error: null,
    })),
  }
  query.select.mockReturnValue(query)
  query.order.mockReturnValue(query)
  query.or.mockReturnValue(query)
  query.is.mockReturnValue(query)
  query.gt.mockReturnValue(query)

  return {
    admin: { from: jest.fn(() => query) },
    query,
  }
}

describe('admin opt-in pagination', () => {
  it('loads one 25-row page plus a single lookahead row', async () => {
    const { admin, query } = mockAdmin(
      Array.from({ length: 30 }, (_, index) => optInRecord(index)),
    )

    const page = await fetchOptInPage(admin as never, '', null, 25)

    expect(page.rows).toHaveLength(25)
    expect(page.nextCursor).toEqual({
      source: 'optin',
      createdAt: '2026-08-11T00:00:00Z',
      id: 'optin-024',
    })
    expect(query.range).toHaveBeenCalledWith(0, 25)
    expect(query.order).toHaveBeenLastCalledWith('id', { ascending: true })
  })

  it('ends pagination when the lookahead row is absent', async () => {
    const { admin, query } = mockAdmin(
      Array.from({ length: 5 }, (_, index) => optInRecord(index + 25)),
    )

    const page = await fetchOptInPage(
      admin as never,
      '',
      {
        source: 'optin',
        createdAt: '2026-08-11T00:00:00Z',
        id: 'optin-024',
      },
      25,
    )

    expect(page.rows.map((row) => row.id)).toEqual([
      'optin-025',
      'optin-026',
      'optin-027',
      'optin-028',
      'optin-029',
    ])
    expect(page.nextCursor).toBeNull()
    expect(query.or).toHaveBeenCalledWith(
      'created_at.lt.2026-08-11T00:00:00Z,and(created_at.eq.2026-08-11T00:00:00Z,id.gt.optin-024),created_at.is.null',
    )
    expect(query.range).toHaveBeenCalledWith(0, 25)
  })

  it('keeps full-database search on every page', async () => {
    const { admin, query } = mockAdmin([])

    await fetchOptInPage(admin as never, '@User_12', null, 25)

    expect(query.or).toHaveBeenCalledWith(
      'username.ilike.%user_12%,twitter_user_id.eq.user_12',
    )
  })
})
