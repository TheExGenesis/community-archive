import {
  analyticsGatewayRequestUrl,
  isClickHouseLabEnvironmentEnabled,
} from './clickhouseLab'
import {
  clickHouseAnalyticsGatewayBaseUrl,
  clickHouseSearchGatewayBaseUrl,
} from './clickhouseGateway'

describe('ClickHouse staging lab guard', () => {
  test('requires the flag and refuses the production Supabase project', () => {
    expect(
      isClickHouseLabEnvironmentEnabled('true', 'https://staging.supabase.co'),
    ).toBe(true)
    expect(
      isClickHouseLabEnvironmentEnabled('false', 'https://staging.supabase.co'),
    ).toBe(false)
    expect(
      isClickHouseLabEnvironmentEnabled(
        'true',
        'https://fabxmporizzqflnftavs.supabase.co',
      ),
    ).toBe(false)
  })

  test('builds only allowlisted gateway paths and parameters', () => {
    const target = analyticsGatewayRequestUrl(
      ['word-trend'],
      new URLSearchParams('q=clickhouse&bucket=month&raw_sql=DROP'),
      'https://stream.example/analytics',
    )
    expect(target.toString()).toBe(
      'https://stream.example/analytics/word-trend?q=clickhouse&bucket=month',
    )
    expect(() =>
      analyticsGatewayRequestUrl(
        ['query'],
        new URLSearchParams(),
        'https://stream.example/analytics',
      ),
    ).toThrow('Unsupported ClickHouse analytics endpoint')
  })

  test('allows only bounded tweet-search parameters', () => {
    const target = analyticsGatewayRequestUrl(
      ['search'],
      new URLSearchParams(
        'q=open+source&mode=phrase&from_user=alice&limit=20&offset=40&raw_sql=DROP',
      ),
      'https://analytics.example',
    )
    expect(target.toString()).toBe(
      'https://analytics.example/search?q=open+source&mode=phrase&from_user=alice&limit=20&offset=40',
    )
  })

  test('routes public search to its dedicated ClickHouse gateway', () => {
    expect(
      clickHouseSearchGatewayBaseUrl(
        'https://analytics.example',
        'https://stream.example:3000/analytics',
      ),
    ).toBe('https://analytics.example')
    expect(
      clickHouseSearchGatewayBaseUrl(
        undefined,
        'https://stream.example:3000/analytics',
      ),
    ).toBe('https://stream.example:3000/analytics')
  })

  test('derives the analytics path from the public gateway when needed', () => {
    expect(
      clickHouseAnalyticsGatewayBaseUrl(
        undefined,
        'https://analytics.example/',
      ),
    ).toBe('https://analytics.example/analytics')
    expect(
      clickHouseAnalyticsGatewayBaseUrl(
        'https://stream.example/analytics',
        'https://analytics.example',
      ),
    ).toBe('https://stream.example/analytics')
  })

  test('allows quote filters without forwarding unknown parameters', () => {
    const target = analyticsGatewayRequestUrl(
      ['top-quotes'],
      new URLSearchParams(
        'limit=25&exclude_self=true&include_usernames=alice%2C+bob&exclude_usernames=bot&raw_sql=DROP',
      ),
      'https://stream.example/analytics',
    )
    expect(target.toString()).toBe(
      'https://stream.example/analytics/top-quotes?limit=25&exclude_self=true&include_usernames=alice%2C+bob&exclude_usernames=bot',
    )
  })

  test('allows bounded stream-stat parameters without forwarding raw SQL', () => {
    const target = analyticsGatewayRequestUrl(
      ['stream-stats'],
      new URLSearchParams(
        'start=2026-07-20T00%3A00%3A00.000Z&end=2026-07-27T00%3A00%3A00.000Z&granularity=day&scope=firehose&raw_sql=DROP',
      ),
      'https://stream.example/analytics',
    )
    expect(target.toString()).toBe(
      'https://stream.example/analytics/stream-stats?start=2026-07-20T00%3A00%3A00.000Z&end=2026-07-27T00%3A00%3A00.000Z&granularity=day&scope=firehose',
    )
  })

  test('allows only the missing-account result limit', () => {
    const target = analyticsGatewayRequestUrl(
      ['missing-accounts'],
      new URLSearchParams('limit=100&raw_sql=DROP'),
      'https://stream.example/analytics',
    )
    expect(target.toString()).toBe(
      'https://stream.example/analytics/missing-accounts?limit=100',
    )
  })
})
