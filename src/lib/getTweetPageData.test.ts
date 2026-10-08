jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('next/cache', () => ({
  unstable_cache: (callback: unknown) => callback,
}))

const createPublicClient = jest.fn()
const createAppClient = jest.fn()

jest.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createPublicClient(...args),
}))
jest.mock('@/utils/supabase', () => ({
  createServerClient: (...args: unknown[]) => createAppClient(...args),
}))

import { createTweetPageDataClient } from './getTweetPageData'

describe('tweet page data source', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('uses the portal public-read project when staging renders production rows', () => {
    const publicClient = { rpc: jest.fn() }
    createPublicClient.mockReturnValue(publicClient)

    const client = createTweetPageDataClient({} as any, {
      NODE_ENV: 'production',
      NEXT_PUBLIC_SUPABASE_URL: 'https://staging-project.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'staging-anon',
      PORTAL_READ_SUPABASE_URL: 'https://prod-project.supabase.co',
      PORTAL_READ_SUPABASE_ANON_KEY: 'prod-public-anon',
    })

    expect(client).toBe(publicClient)
    expect(createPublicClient).toHaveBeenCalledWith(
      'https://prod-project.supabase.co',
      'prod-public-anon',
      { auth: { persistSession: false } },
    )
    expect(createAppClient).not.toHaveBeenCalled()
  })

  it('keeps the app Supabase client when no portal override is configured', () => {
    const cookieStore = {} as any
    const appClient = { rpc: jest.fn() }
    createAppClient.mockReturnValue(appClient)

    expect(
      createTweetPageDataClient(cookieStore, {
        NODE_ENV: 'production',
        NEXT_PUBLIC_SUPABASE_URL: 'https://prod-project.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'prod-anon',
      }),
    ).toBe(appClient)
    expect(createAppClient).toHaveBeenCalledWith(cookieStore)
    expect(createPublicClient).not.toHaveBeenCalled()
  })
})
