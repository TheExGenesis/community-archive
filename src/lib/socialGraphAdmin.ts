import 'server-only'
import { clickHouseAnalyticsGatewayBaseUrl } from './clickhouseGateway'

interface FullRebuildOptions {
  fetchImpl?: typeof fetch
  baseUrl?: string
  gatewayToken?: string
  adminToken?: string
}

export function socialGraphFullRebuildUrl(
  baseUrl = clickHouseAnalyticsGatewayBaseUrl(),
): URL {
  if (!baseUrl) {
    throw new Error('CLICKHOUSE_ANALYTICS_API_URL is not configured')
  }
  const base = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`)
  return new URL('admin/social-graph/rebuild', base)
}

export async function requestSocialGraphFullRebuild(
  options: FullRebuildOptions = {},
): Promise<{ accepted: true; status: 'queued' }> {
  const gatewayToken =
    options.gatewayToken ?? process.env.CLICKHOUSE_ANALYTICS_API_TOKEN
  const adminToken =
    options.adminToken ?? process.env.CLICKHOUSE_ANALYTICS_ADMIN_TOKEN
  if (!gatewayToken || !adminToken) {
    throw new Error('Social graph rebuild credentials are not configured')
  }
  const response = await (options.fetchImpl ?? fetch)(
    socialGraphFullRebuildUrl(options.baseUrl),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${gatewayToken}`,
        'X-Community-Archive-Admin-Token': adminToken,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    },
  )
  const body = await response.text()
  if (!response.ok) {
    throw new Error(
      `Social graph full rebuild request failed (${response.status})`,
    )
  }
  let result: { accepted?: unknown; status?: unknown }
  try {
    result = JSON.parse(body) as { accepted?: unknown; status?: unknown }
  } catch {
    throw new Error('Social graph full rebuild returned invalid JSON')
  }
  if (result.accepted !== true || result.status !== 'queued') {
    throw new Error('Social graph full rebuild was not accepted')
  }
  return { accepted: true, status: 'queued' }
}
