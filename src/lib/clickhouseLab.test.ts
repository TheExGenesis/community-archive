import {
  analyticsGatewayRequestUrl,
  isClickHouseLabEnvironmentEnabled,
} from './clickhouseLab'
import { clickHouseSearchGatewayBaseUrl } from './clickhouseGateway'

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
      'https://stream.example/analytics',
    )
    expect(target.toString()).toBe(
      'https://stream.example/analytics/search?q=open+source&mode=phrase&from_user=alice&limit=20&offset=40',
    )
  })

  test('routes public search to its dedicated ClickHouse gateway', () => {
    expect(
      clickHouseSearchGatewayBaseUrl(
        'https://stream.example:3001/analytics',
        'https://stream.example:3000/analytics',
      ),
    ).toBe('https://stream.example:3001/analytics')
    expect(
      clickHouseSearchGatewayBaseUrl(
        undefined,
        'https://stream.example:3000/analytics',
      ),
    ).toBe('https://stream.example:3000/analytics')
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
})
