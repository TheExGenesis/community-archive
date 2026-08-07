jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('next/cache', () => ({
  unstable_cache: (callback: unknown) => callback,
}))

import { portalDataSourceKey, resolvePortalReadConfig } from './data'

describe('portal read source', () => {
  test('uses an explicit server-only row source without changing app Supabase', () => {
    const config = resolvePortalReadConfig({
      NODE_ENV: 'production',
      NEXT_PUBLIC_SUPABASE_URL: 'https://staging-project.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'staging-anon',
      PORTAL_READ_SUPABASE_URL: 'https://prod-project.supabase.co',
      PORTAL_READ_SUPABASE_ANON_KEY: 'prod-public-anon',
    })

    expect(config).toEqual({
      url: 'https://prod-project.supabase.co',
      anonKey: 'prod-public-anon',
      sourceId: 'prod-project.supabase.co',
    })
  })

  test('requires the read URL and anonymous key together', () => {
    expect(() =>
      resolvePortalReadConfig({
        NODE_ENV: 'production',
        PORTAL_READ_SUPABASE_URL: 'https://prod-project.supabase.co',
      }),
    ).toThrow('must be configured together')
  })

  test('keys caches by deployment, ClickHouse host, and row source', () => {
    const key = portalDataSourceKey({
      NODE_ENV: 'production',
      VERCEL_ENV: 'preview',
      CLICKHOUSE_SEARCH_API_URL: 'https://analytics.example',
      PORTAL_READ_SUPABASE_URL: 'https://prod-project.supabase.co',
      PORTAL_READ_SUPABASE_ANON_KEY: 'prod-public-anon',
    })

    expect(key).toBe(
      'portal-v3:preview:analytics.example:prod-project.supabase.co',
    )
  })
})
