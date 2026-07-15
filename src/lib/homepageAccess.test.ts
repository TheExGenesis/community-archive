import { canShowHomepageSearch } from './homepageAccess'

describe('canShowHomepageSearch', () => {
  it('hides search from logged-out visitors', () => {
    expect(canShowHomepageSearch(null, true)).toBe(false)
  })

  it('hides search from signed-in visitors who have not opted in', () => {
    expect(canShowHomepageSearch('user-1', false)).toBe(false)
  })

  it('shows search only to signed-in opted-in members', () => {
    expect(canShowHomepageSearch('user-1', true)).toBe(true)
  })
})
