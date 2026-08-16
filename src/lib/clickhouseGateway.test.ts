import { analyticsGatewayRequestUrl } from './clickhouseGateway'

test('forwards only allowlisted personalized interaction parameters', () => {
  const params = new URLSearchParams({
    limit: '5',
    missing_only: 'true',
    unexpected: 'secret',
  })

  const url = analyticsGatewayRequestUrl(
    ['user', '42', 'interactions'],
    params,
    'https://analytics.example/analytics',
  )

  expect(url.toString()).toBe(
    'https://analytics.example/analytics/user/42/interactions?limit=5&missing_only=true',
  )
})
