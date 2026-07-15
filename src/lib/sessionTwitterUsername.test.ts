import type { User } from '@supabase/supabase-js'
import {
  getSessionTwitterUsername,
  SessionIdentityEnvironment,
} from './sessionTwitterUsername'

const stagingEnvironment: SessionIdentityEnvironment = {
  nodeEnv: 'production',
  stagingDevLoginEnabled: true,
  useRemoteDevDb: false,
  supabaseUrl: 'https://staging-project.supabase.co',
}

const createUser = (overrides: Partial<User> = {}) =>
  ({
    id: 'auth-user-1',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-07-15T00:00:00.000Z',
    ...overrides,
  }) as User

describe('getSessionTwitterUsername', () => {
  it('uses a real Twitter identity in every environment', () => {
    const user = createUser({
      identities: [
        {
          id: 'twitter-1',
          identity_id: 'twitter-identity-1',
          user_id: 'auth-user-1',
          identity_data: { user_name: 'Real_User' },
          provider: 'twitter',
          created_at: '2026-07-15T00:00:00.000Z',
          updated_at: '2026-07-15T00:00:00.000Z',
          last_sign_in_at: '2026-07-15T00:00:00.000Z',
        },
      ],
    })

    expect(
      getSessionTwitterUsername(user, {
        nodeEnv: 'production',
        supabaseUrl: 'https://fabxmporizzqflnftavs.supabase.co',
      }),
    ).toBe('real_user')
  })

  it('uses legacy server-set staging metadata on a non-production project', () => {
    const user = createUser({
      app_metadata: {
        user_name: 'Alice_Dev',
      },
    })

    expect(getSessionTwitterUsername(user, stagingEnvironment)).toBe(
      'alice_dev',
    )
  })

  it('rejects staging metadata when mock login is disabled', () => {
    const user = createUser({
      app_metadata: { provider: 'staging', user_name: 'alice_dev' },
    })

    expect(
      getSessionTwitterUsername(user, {
        ...stagingEnvironment,
        stagingDevLoginEnabled: false,
      }),
    ).toBeNull()
  })

  it('rejects staging metadata on the production project', () => {
    const user = createUser({
      app_metadata: { provider: 'staging', user_name: 'alice_dev' },
    })

    expect(
      getSessionTwitterUsername(user, {
        ...stagingEnvironment,
        supabaseUrl: 'https://fabxmporizzqflnftavs.supabase.co',
      }),
    ).toBeNull()
  })

  it('never trusts user-editable metadata as a mock identity', () => {
    const user = createUser({
      app_metadata: { provider: 'staging' },
      user_metadata: { user_name: 'spoofed_user' },
    })

    expect(getSessionTwitterUsername(user, stagingEnvironment)).toBeNull()
  })

  it('supports server-created email users against the local dev project', () => {
    const user = createUser({
      app_metadata: { provider: 'email', user_name: 'local_dev' },
    })

    expect(
      getSessionTwitterUsername(user, {
        nodeEnv: 'development',
        useRemoteDevDb: false,
        localSupabaseUrl: 'http://127.0.0.1:54321',
      }),
    ).toBe('local_dev')
  })
})
