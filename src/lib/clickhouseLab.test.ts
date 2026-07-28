import {
  analyticsGatewayRequestUrl,
  isClickHouseLabEnvironmentEnabled,
} from './clickhouseLab'

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

  test('allows quote filters without forwarding unknown parameters', () => {
    const target = analyticsGatewayRequestUrl(
      ['top-quotes'],
      new URLSearchParams(
        'limit=25&exclude_self=true&target_ca_users_only=true&quote_ca_users_only=true&include_usernames=alice%2C+bob&exclude_usernames=bot&raw_sql=DROP',
      ),
      'https://stream.example/analytics',
    )
    expect(target.toString()).toBe(
      'https://stream.example/analytics/top-quotes?limit=25&exclude_self=true&target_ca_users_only=true&quote_ca_users_only=true&include_usernames=alice%2C+bob&exclude_usernames=bot',
    )
  })

  test('allows paginated quote evidence only for numeric target IDs', () => {
    const target = analyticsGatewayRequestUrl(
      ['quote-posts', '18446744073709551615'],
      new URLSearchParams(
        'limit=25&offset=50&exclude_self=true&quote_ca_users_only=true&include_usernames=alice&raw_sql=DROP',
      ),
      'https://stream.example/analytics',
    )
    expect(target.toString()).toBe(
      'https://stream.example/analytics/quote-posts/18446744073709551615?limit=25&offset=50&exclude_self=true&quote_ca_users_only=true&include_usernames=alice',
    )
    expect(() =>
      analyticsGatewayRequestUrl(
        ['quote-posts', 'not-a-tweet'],
        new URLSearchParams(),
        'https://stream.example/analytics',
      ),
    ).toThrow('Unsupported ClickHouse analytics endpoint')
  })
})
