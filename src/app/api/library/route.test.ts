/** @jest-environment node */
import { NextRequest } from 'next/server'

const fetchAnalyticsGatewayJson = jest.fn()
jest.mock('@/lib/clickhouseGateway', () => ({
  ...jest.requireActual('@/lib/clickhouseGateway'),
  fetchAnalyticsGatewayJson: (...args: unknown[]) =>
    fetchAnalyticsGatewayJson(...args),
}))
jest.mock('@/lib/observability/serverErrorCapture', () => ({
  ...jest.requireActual('@/lib/observability/serverErrorCapture'),
  captureServerException: jest.fn(),
}))

import { AnalyticsGatewayError } from '@/lib/clickhouseGateway'
import { GET as catalogue } from './route'
import { GET as shard } from './shard/[n]/route'

const request = (path: string) => new NextRequest(`http://localhost${path}`)
const shardParams = (n: string) => ({ params: Promise.resolve({ n }) })

describe('library routes', () => {
  beforeEach(() => {
    fetchAnalyticsGatewayJson.mockReset()
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => jest.restoreAllMocks())

  it('serves the catalogue from the gateway with a shared cache', async () => {
    fetchAnalyticsGatewayJson.mockResolvedValue({ works: [], shards: 32 })
    const response = await catalogue(request('/api/library'))
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toContain('s-maxage=3600')
    expect(fetchAnalyticsGatewayJson).toHaveBeenCalledWith(['library'])
  })

  it('answers a gateway failure with an uncacheable 502, not an empty list', async () => {
    fetchAnalyticsGatewayJson.mockRejectedValue(
      new AnalyticsGatewayError(502, 'stale'),
    )
    const response = await catalogue(request('/api/library'))
    expect(response.status).toBe(502)
    expect(response.headers.get('Cache-Control') ?? '').not.toContain('s-maxage')
  })

  it('serves a shard and rejects anything that is not a shard number', async () => {
    fetchAnalyticsGatewayJson.mockResolvedValue({ abc: { who: [], top: [] } })
    const ok = await shard(request('/api/library/shard/7'), shardParams('7'))
    expect(ok.status).toBe(200)
    expect(fetchAnalyticsGatewayJson).toHaveBeenCalledWith(['library', 'shard', '7'])
    const bad = await shard(request('/api/library/shard/x'), shardParams('../x'))
    expect(bad.status).toBe(404)
    expect(fetchAnalyticsGatewayJson).toHaveBeenCalledTimes(1)
  })

  it('passes a gateway 404 through as 404', async () => {
    fetchAnalyticsGatewayJson.mockRejectedValue(
      new AnalyticsGatewayError(404, 'Not found'),
    )
    const response = await shard(request('/api/library/shard/99'), shardParams('99'))
    expect(response.status).toBe(404)
  })
})
