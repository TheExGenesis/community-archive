import { buildAuthErrorUrl, getAuthErrorCopy } from './authCallback'

describe('auth callback helpers', () => {
  it('preserves provider error details on the local error page', () => {
    const url = buildAuthErrorUrl('https://www.community-archive.org', {
      error: 'server_error',
      errorCode: '500',
      errorDescription: 'Error getting user email from external provider',
    })

    expect(url.origin).toBe('https://www.community-archive.org')
    expect(url.pathname).toBe('/auth/auth-code-error')
    expect(url.searchParams.get('error')).toBe('server_error')
    expect(url.searchParams.get('error_code')).toBe('500')
    expect(url.searchParams.get('error_description')).toBe(
      'Error getting user email from external provider',
    )
  })

  it('caps untrusted provider error values', () => {
    const url = buildAuthErrorUrl('https://www.community-archive.org', {
      errorDescription: 'x'.repeat(500),
    })

    expect(url.searchParams.get('error_description')).toHaveLength(300)
  })

  it('gives missing-email failures actionable copy', () => {
    expect(
      getAuthErrorCopy({
        errorDescription: 'Error getting user email from external provider',
      }),
    ).toEqual({
      title: 'X did not provide an email address',
      description:
        'Community Archive now supports X accounts without an email address. Please try signing in again.',
    })
  })
})
