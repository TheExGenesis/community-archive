import type { User } from '@supabase/supabase-js'
import { toSessionAccount } from './useAuthAndArchive'

jest.mock('@/utils/supabase', () => ({ createBrowserClient: jest.fn() }))

const spoofedUserMetadata = {
  provider_id: '999',
  user_name: 'victim',
  avatar_url: 'https://attacker.example/avatar.png',
}

test('builds the session account from the Twitter identity only', () => {
  const user = {
    id: 'auth-user-1',
    app_metadata: { provider_id: '999', user_name: 'victim' },
    user_metadata: spoofedUserMetadata,
    identities: [
      {
        id: '42',
        provider: 'twitter',
        identity_data: {
          provider_id: '42',
          user_name: 'ArchiveMember',
          avatar_url: 'https://pbs.twimg.com/profile_images/42/a.jpg',
        },
      },
    ],
  } as unknown as User

  expect(toSessionAccount(user)).toEqual({
    provider_id: '42',
    user_name: 'archivemember',
    avatar_url: 'https://pbs.twimg.com/profile_images/42/a.jpg',
  })
})

test('keeps a signed-in user without a trusted account signed in but unnamed', () => {
  const user = {
    id: 'auth-user-1',
    app_metadata: {},
    user_metadata: spoofedUserMetadata,
    identities: [],
  } as unknown as User

  expect(toSessionAccount(user)).toEqual({
    provider_id: null,
    user_name: null,
    avatar_url: null,
  })
  expect(toSessionAccount(null)).toBeNull()
})
