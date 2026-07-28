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
})
