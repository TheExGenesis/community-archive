import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('root layout authentication boundary', () => {
  test('keeps Supabase Auth out of the root server render', () => {
    const layout = read('src/app/layout.tsx')

    for (const serverAuthReference of [
      'checkIsAdmin',
      'getIsMember',
      'getCurrentUser',
      'createServerClient',
      'cookies()',
    ]) {
      expect(layout).not.toContain(serverAuthReference)
    }
    expect(layout).not.toContain('async function RootLayout')
    expect(layout).toContain('<NavigationAudienceProvider>')
  })

  test('checks the session after hydration and preserves private route guards', () => {
    const audience = read('src/components/NavigationAudience.tsx')
    const adminPage = read('src/app/admin/page.tsx')
    const graphPage = read('src/app/social-graph/page.tsx')

    expect(audience).toContain("fetch('/api/auth/navigation'")
    expect(audience.indexOf('PUBLIC_AUDIENCE')).toBeLessThan(
      audience.indexOf("fetch('/api/auth/navigation'"),
    )
    expect(adminPage).toContain('await requireAdmin()')
    expect(graphPage).not.toContain('requireAdmin')
    expect(graphPage).toContain('await getCurrentUser()')
  })
})
