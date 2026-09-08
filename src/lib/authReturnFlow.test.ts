import { GET } from '@/app/api/auth/callback/route'
import { createServerAdminClient } from '@/utils/supabase'
jest.mock('@/utils/supabase', () => ({ createServerAdminClient: jest.fn() }))
jest.mock('next/headers', () => ({ cookies: () => ({}) }))
test.each([
  ['/trends?q=art&granularity=month', '/trends?q=art&granularity=month'],
  ['//evil.example', '/'],
  ['/\\evil.example', '/'],
])(
  'returns the completed OAuth session to a safe requested page',
  async (next, expected) => {
    jest.mocked(createServerAdminClient).mockReturnValue({
      auth: {
        exchangeCodeForSession: async () => ({
          data: { user: { id: 'qa', user_metadata: {} } },
          error: null,
        }),
        admin: { updateUserById: async () => ({ error: null }) },
      },
    } as unknown as ReturnType<typeof createServerAdminClient>)
    const response = await GET(
      new Request(
        `https://www.community-archive.org/api/auth/callback?code=qa-code&next=${encodeURIComponent(next)}`,
      ),
    )
    expect(response.headers.get('location')).toBe(
      `https://www.community-archive.org${expected}`,
    )
  },
)
