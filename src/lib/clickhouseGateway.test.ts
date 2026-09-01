import {
  analyticsGatewayRequestUrl,
  clickHouseAnalyticsGatewayBaseUrl,
  clickHouseSearchGatewayBaseUrl,
} from './clickhouseGateway'

describe('ClickHouse analytics gateway requests', () => {
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

  test('allows the parameterless corpus-count endpoint', () => {
    const target = analyticsGatewayRequestUrl(
      ['corpus-count'],
      new URLSearchParams('raw_sql=DROP'),
      'https://stream.example/analytics',
    )
    expect(target.toString()).toBe(
      'https://stream.example/analytics/corpus-count',
    )
  })

  test('allows only bounded member-directory parameters', () => {
    const target = analyticsGatewayRequestUrl(
      ['member-directory'],
      new URLSearchParams(
        'limit=15&offset=30&sort_by=num_followers&sort_order=desc&search=alice&raw_sql=DROP',
      ),
      'https://stream.example/analytics',
    )
    expect(target.toString()).toBe(
      'https://stream.example/analytics/member-directory?limit=15&offset=30&sort_by=num_followers&sort_order=desc&search=alice',
    )
  })

  test('allows only bounded tweet-search parameters', () => {
    const target = analyticsGatewayRequestUrl(
      ['search'],
      new URLSearchParams(
        'q=open+source&mode=phrase&from_user=alice&limit=1&offset=0&preview=true&exclude_retweets=true&raw_sql=DROP',
      ),
      'https://analytics.example',
    )
    expect(target.toString()).toBe(
      'https://analytics.example/search?q=open+source&mode=phrase&from_user=alice&limit=1&offset=0&preview=true&exclude_retweets=true',
    )
  })

  test('allows only bounded trend-evidence parameters', () => {
    const target = analyticsGatewayRequestUrl(
      ['trend-evidence'],
      new URLSearchParams(
        'q=tpot&mode=all&since=2024-01-01&until=2026-01-01&sort=oldest&limit=50&offset=40&raw_sql=DROP',
      ),
      'https://analytics.example',
    )
    expect(target.toString()).toBe(
      'https://analytics.example/trend-evidence?q=tpot&mode=all&since=2024-01-01&until=2026-01-01&sort=oldest&limit=50&offset=40',
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

  test('allows quote and authored-time filters without forwarding unknown parameters', () => {
    const target = analyticsGatewayRequestUrl(
      ['top-quotes'],
      new URLSearchParams(
        'limit=25&offset=50&sort=recent&year=2024&created_after=2024-01-01T00%3A00%3A00.000Z&created_before=2024-04-01T00%3A00%3A00.000Z&q=archive&target_account_id=42&min_quote_count=2&exclude_self=true&target_ca_users_only=false&quote_ca_users_only=true&include_usernames=alice%2C+bob&exclude_usernames=bot&raw_sql=DROP',
      ),
      'https://stream.example/analytics',
    )
    expect(target.toString()).toBe(
      'https://stream.example/analytics/top-quotes?limit=25&offset=50&sort=recent&year=2024&created_after=2024-01-01T00%3A00%3A00.000Z&created_before=2024-04-01T00%3A00%3A00.000Z&q=archive&target_account_id=42&min_quote_count=2&exclude_self=true&target_ca_users_only=false&quote_ca_users_only=true&include_usernames=alice%2C+bob&exclude_usernames=bot',
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

  test('allows only bounded recent-banger inputs', () => {
    const target = analyticsGatewayRequestUrl(
      ['recent-bangers'],
      new URLSearchParams('limit=50&hours=48&raw_sql=DROP'),
      'https://stream.example/analytics',
    )
    expect(target.toString()).toBe(
      'https://stream.example/analytics/recent-bangers?limit=50&hours=48',
    )
  })

  test('allows only paired portal stream cursor inputs', () => {
    const target = analyticsGatewayRequestUrl(
      ['portal-stream'],
      new URLSearchParams(
        'limit=100&after=2026-08-07T12%3A00%3A00.000Z&after_id=42&raw_sql=DROP',
      ),
      'https://stream.example/analytics',
    )
    expect(target.toString()).toBe(
      'https://stream.example/analytics/portal-stream?limit=100&after=2026-08-07T12%3A00%3A00.000Z&after_id=42',
    )
  })

  test('allows only numeric tweet-detail paths and no query parameters', () => {
    const target = analyticsGatewayRequestUrl(
      ['tweet', '2085473085399150817'],
      new URLSearchParams('raw_sql=DROP'),
      'https://stream.example/analytics',
    )
    expect(target.toString()).toBe(
      'https://stream.example/analytics/tweet/2085473085399150817',
    )
    expect(() =>
      analyticsGatewayRequestUrl(
        ['tweet', 'not-a-tweet'],
        new URLSearchParams(),
        'https://stream.example/analytics',
      ),
    ).toThrow('Unsupported ClickHouse analytics endpoint')
  })

  test('allows only numeric tweet-thread paths and no query parameters', () => {
    const target = analyticsGatewayRequestUrl(
      ['tweet', '2085473085399150817', 'thread'],
      new URLSearchParams('raw_sql=DROP'),
      'https://stream.example/analytics',
    )
    expect(target.toString()).toBe(
      'https://stream.example/analytics/tweet/2085473085399150817/thread',
    )
    expect(() =>
      analyticsGatewayRequestUrl(
        ['tweet', 'not-a-tweet', 'thread'],
        new URLSearchParams(),
        'https://stream.example/analytics',
      ),
    ).toThrow('Unsupported ClickHouse analytics endpoint')
  })

  test('allows only scoped profile-sidebar parameters for numeric accounts', () => {
    const target = analyticsGatewayRequestUrl(
      ['user', '42', 'sidebar'],
      new URLSearchParams(
        'year=2025&media_limit=18&people_limit=8&raw_sql=DROP',
      ),
      'https://stream.example/analytics',
    )
    expect(target.toString()).toBe(
      'https://stream.example/analytics/user/42/sidebar?year=2025&media_limit=18&people_limit=8',
    )
    expect(() =>
      analyticsGatewayRequestUrl(
        ['user', 'not-an-id', 'sidebar'],
        new URLSearchParams(),
        'https://stream.example/analytics',
      ),
    ).toThrow('Unsupported ClickHouse analytics endpoint')
  })

  test('allows a core user read to omit interactions', () => {
    const target = analyticsGatewayRequestUrl(
      ['user', 'alice'],
      new URLSearchParams('limit=20&include_interactions=false&raw_sql=DROP'),
      'https://stream.example/analytics',
    )
    expect(target.toString()).toBe(
      'https://stream.example/analytics/user/alice?limit=20&include_interactions=false',
    )
  })

  test('allows independently scoped profile enrichment reads', () => {
    const media = analyticsGatewayRequestUrl(
      ['user', '42', 'media'],
      new URLSearchParams('year=2025&limit=6&people_limit=8'),
      'https://stream.example/analytics',
    )
    const interactions = analyticsGatewayRequestUrl(
      ['user', '42', 'interactions'],
      new URLSearchParams('year=2025&limit=8&media_limit=6'),
      'https://stream.example/analytics',
    )
    expect(media.toString()).toBe(
      'https://stream.example/analytics/user/42/media?year=2025&limit=6',
    )
    expect(interactions.toString()).toBe(
      'https://stream.example/analytics/user/42/interactions?year=2025&limit=8',
    )

    const usernameInteractions = analyticsGatewayRequestUrl(
      ['user', 'alice', 'interactions'],
      new URLSearchParams('year=2025&limit=8'),
      'https://stream.example/analytics',
    )
    expect(usernameInteractions.toString()).toBe(
      'https://stream.example/analytics/user/alice/interactions?year=2025&limit=8',
    )
  })

  test('allows bounded reverse-quote parameters for numeric tweet IDs', () => {
    const target = analyticsGatewayRequestUrl(
      ['quote-posts', '2085375983708692599'],
      new URLSearchParams(
        'limit=12&offset=0&exclude_self=true&quote_ca_users_only=true&raw_sql=DROP',
      ),
      'https://stream.example/analytics',
    )
    expect(target.toString()).toBe(
      'https://stream.example/analytics/quote-posts/2085375983708692599?limit=12&offset=0&exclude_self=true&quote_ca_users_only=true',
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
