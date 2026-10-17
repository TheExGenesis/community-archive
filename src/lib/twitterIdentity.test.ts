import type { User } from '@supabase/supabase-js'
import {
  getAccountIdentity,
  getTwitterAvatarUrl,
  getTwitterProviderId,
  getTwitterUsername,
} from './twitterIdentity'

const spoofedUserMetadata = {
  provider_id: '999',
  user_name: 'victim',
  avatar_url: 'https://attacker.example/avatar.png',
}

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'auth-user-1',
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00Z',
    app_metadata: {},
    user_metadata: spoofedUserMetadata,
    identities: [],
    ...overrides,
  }) as User

const twitterIdentity = (
  identityData: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
) =>
  ({
    id: '42',
    identity_id: 'identity-1',
    user_id: 'auth-user-1',
    provider: 'twitter',
    identity_data: identityData,
    ...overrides,
  }) as NonNullable<User['identities']>[number]

describe('Twitter identity helpers', () => {
  it('reads the account from the Twitter identity and ignores user_metadata', () => {
    const user = makeUser({
      identities: [
        twitterIdentity({
          provider_id: '42',
          user_name: '@ArchiveMember',
          avatar_url: 'https://pbs.twimg.com/profile_images/42/a.jpg',
        }),
      ],
    })

    expect(getTwitterProviderId(user)).toBe('42')
    expect(getTwitterUsername(user)).toBe('archivemember')
    expect(getTwitterAvatarUrl(user)).toBe(
      'https://pbs.twimg.com/profile_images/42/a.jpg',
    )
    expect(getAccountIdentity(user)).toEqual({
      providerId: '42',
      username: 'archivemember',
    })
  })

  it('accepts the x provider and falls back from provider_id to sub and the identity id', () => {
    const xUser = makeUser({
      identities: [
        twitterIdentity(
          { sub: '43', preferred_username: 'x_member' },
          { provider: 'x' },
        ),
      ],
    })
    expect(getTwitterProviderId(xUser)).toBe('43')
    expect(getTwitterUsername(xUser)).toBe('x_member')

    const bareUser = makeUser({
      identities: [twitterIdentity({}, { id: '44' })],
    })
    expect(getTwitterProviderId(bareUser)).toBe('44')
    expect(getTwitterUsername(bareUser)).toBeNull()
  })

  it('skips a malformed identity handle', () => {
    const user = makeUser({
      identities: [
        twitterIdentity({ user_name: 'not a handle', screen_name: 'Valid_1' }),
      ],
    })

    expect(getTwitterUsername(user)).toBe('valid_1')
  })

  it('uses server-written app_metadata when there is no Twitter identity', () => {
    const mockUser = makeUser({
      app_metadata: { provider_id: 'mock_alice', user_name: 'Alice_Dev' },
      identities: [
        {
          id: 'auth-user-1',
          identity_id: 'identity-2',
          user_id: 'auth-user-1',
          provider: 'email',
          identity_data: { user_name: 'victim', provider_id: '999' },
        } as NonNullable<User['identities']>[number],
      ],
    })

    expect(getTwitterProviderId(mockUser)).toBeNull()
    expect(getTwitterAvatarUrl(mockUser)).toBeNull()
    expect(getAccountIdentity(mockUser)).toEqual({
      providerId: 'mock_alice',
      username: 'alice_dev',
    })
  })

  it('returns no account when only user_metadata names one', () => {
    expect(getAccountIdentity(makeUser())).toEqual({
      providerId: null,
      username: null,
    })
  })
})
