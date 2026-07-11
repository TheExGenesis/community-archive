import { isProductionSupabaseUrl } from './isProductionSupabaseUrl'

describe('isProductionSupabaseUrl', () => {
  it('recognizes the production Supabase project', () => {
    expect(
      isProductionSupabaseUrl('https://fabxmporizzqflnftavs.supabase.co'),
    ).toBe(true)
  })

  it('allows deployed staging and preview projects', () => {
    expect(isProductionSupabaseUrl('https://staging-project.supabase.co')).toBe(
      false,
    )
    expect(isProductionSupabaseUrl(undefined)).toBe(false)
  })
})
