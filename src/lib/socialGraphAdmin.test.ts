import {
  requestSocialGraphFullRebuild,
  socialGraphFullRebuildUrl,
} from './socialGraphAdmin'

describe('social graph full rebuild request', () => {
  it('uses the dedicated admin credential on the bounded gateway route', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ accepted: true, status: 'queued' }), {
        status: 202,
      }),
    )

    await expect(
      requestSocialGraphFullRebuild({
        fetchImpl: fetchMock,
        baseUrl: 'https://analytics.example/analytics',
        gatewayToken: 'gateway-secret',
        adminToken: 'admin-secret',
      }),
    ).resolves.toEqual({ accepted: true, status: 'queued' })
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('https://analytics.example/analytics/admin/social-graph/rebuild'),
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer gateway-secret',
          'X-Community-Archive-Admin-Token': 'admin-secret',
        },
        cache: 'no-store',
      }),
    )
  })

  it('fails closed without both server-only credentials', async () => {
    await expect(
      requestSocialGraphFullRebuild({
        baseUrl: 'https://analytics.example/analytics',
        gatewayToken: 'gateway-secret',
        adminToken: '',
      }),
    ).rejects.toThrow('credentials are not configured')
  })

  it('keeps the rebuild path under the configured analytics base', () => {
    expect(
      socialGraphFullRebuildUrl('https://analytics.example/analytics/').href,
    ).toBe('https://analytics.example/analytics/admin/social-graph/rebuild')
  })
})
