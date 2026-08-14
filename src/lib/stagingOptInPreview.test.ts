import { isStagingOptInPreviewEnabled } from '@/lib/stagingOptInPreview'

describe('isStagingOptInPreviewEnabled', () => {
  it('enables mock opt-in against a configured staging project', () => {
    expect(
      isStagingOptInPreviewEnabled(true, {
        stagingDevLoginEnabled: true,
        supabaseUrl: 'https://community-archive-staging.supabase.co',
      }),
    ).toBe(true)
  })

  it('stays disabled unless mock mode is explicitly requested', () => {
    expect(
      isStagingOptInPreviewEnabled(false, {
        stagingDevLoginEnabled: true,
        supabaseUrl: 'https://community-archive-staging.supabase.co',
      }),
    ).toBe(false)
  })

  it('stays disabled unless staging dev login is explicitly enabled', () => {
    expect(
      isStagingOptInPreviewEnabled(true, {
        stagingDevLoginEnabled: false,
        supabaseUrl: 'https://community-archive-staging.supabase.co',
      }),
    ).toBe(false)
  })

  it('stays disabled when the Supabase URL is missing', () => {
    expect(
      isStagingOptInPreviewEnabled(true, {
        stagingDevLoginEnabled: true,
      }),
    ).toBe(false)
  })

  it('cannot be enabled against the production Supabase project', () => {
    expect(
      isStagingOptInPreviewEnabled(true, {
        stagingDevLoginEnabled: true,
        supabaseUrl: 'https://fabxmporizzqflnftavs.supabase.co',
      }),
    ).toBe(false)
  })
})
