import { getMobileNav, getPrimaryNav } from './navigation'

describe('member navigation', () => {
  it('includes the member directory in desktop and mobile navigation', () => {
    expect(getPrimaryNav(true)).toContainEqual({
      href: '/user-dir',
      label: 'Library',
    })
    expect(getMobileNav(true)).toContainEqual({
      href: '/user-dir',
      label: 'Library',
    })
  })
})
