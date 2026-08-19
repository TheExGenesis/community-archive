import { isAdminUser } from '@/app/admin/data'
import type { User } from '@supabase/supabase-js'

const twitterUser = (username: string, providerId: string) =>
  ({
    id: 'auth-user-id',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-08-19T00:00:00Z',
    identities: [
      {
        id: providerId,
        user_id: 'auth-user-id',
        identity_data: {
          user_name: username,
          provider_id: providerId,
        },
        provider: 'twitter',
        created_at: '2026-08-19T00:00:00Z',
        updated_at: '2026-08-19T00:00:00Z',
      },
    ],
  }) as User

describe('admin identity gate', () => {
  it('grants Christine admin access using her X handle and immutable account id', () => {
    expect(
      isAdminUser(twitterUser('@ChristineIst', '826134955549790208')),
    ).toBe(true)
  })

  it('rejects the same handle when the immutable X account id does not match', () => {
    expect(isAdminUser(twitterUser('christineist', 'different-account'))).toBe(
      false,
    )
  })

  it('rejects Twitter identities outside the explicit admin allowlist', () => {
    expect(isAdminUser(twitterUser('not_an_admin', '123'))).toBe(false)
  })

  it('does not trust user-mutable metadata for admin identity', () => {
    const user = twitterUser('not_an_admin', '123')
    user.user_metadata = { user_name: 'christineist' }

    expect(isAdminUser(user)).toBe(false)
  })
})
