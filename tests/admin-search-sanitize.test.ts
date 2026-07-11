import { normalizeUsername, sanitizeAdminSearch } from '@/app/admin/data'

// Threat model: the admin search input is interpolated into a PostgREST
// `.or(...)` filter string of the form
//   `username.ilike.%${search}%,twitter_user_id.eq.${search}`
// PostgREST parses that as a comma-separated list of filter expressions,
// with parentheses for nested `and(...)` / `or(...)` groups. An attacker
// who controls `search` can inject additional predicates on the same
// table by including a `,`, `(`, `)`, `.`, etc.
//
// sanitizeAdminSearch must collapse the input to `[a-z0-9_]` only — the
// character set Twitter usernames and numeric ids actually use — so that
// no PostgREST filter metacharacter survives.
describe('sanitizeAdminSearch (admin PostgREST .or() injection guard)', () => {
  it('passes plain twitter usernames through unchanged', () => {
    expect(sanitizeAdminSearch('jack')).toBe('jack')
    expect(sanitizeAdminSearch('user_123')).toBe('user_123')
  })

  it('passes numeric twitter user ids through unchanged', () => {
    expect(sanitizeAdminSearch('12345678')).toBe('12345678')
  })

  it('strips a comma injecting an extra .or() predicate', () => {
    // `foo,username.eq.x` would, if interpolated raw, add a third
    // predicate to the .or() filter and surface unrelated rows.
    expect(sanitizeAdminSearch('foo,username.eq.x')).toBe('foousernameeqx')
  })

  it('strips parentheses used to smuggle nested and(...) clauses', () => {
    expect(sanitizeAdminSearch('foo,and(opted_in.eq.true)')).toBe(
      'fooandopted_ineqtrue',
    )
  })

  it('strips dots, asterisks, quotes, and percent signs', () => {
    expect(sanitizeAdminSearch('a.b*c"d%e')).toBe('abcde')
  })

  it('lowercases and trims via normalizeUsername first', () => {
    expect(sanitizeAdminSearch('  @JACK  ')).toBe('jack')
  })

  it('returns empty string for nullish / all-stripped input', () => {
    expect(sanitizeAdminSearch(null)).toBe('')
    expect(sanitizeAdminSearch(undefined)).toBe('')
    expect(sanitizeAdminSearch(',.()*')).toBe('')
  })

  it('caps length via normalizeUsername (80 chars)', () => {
    const long = 'a'.repeat(200)
    expect(sanitizeAdminSearch(long)).toBe('a'.repeat(80))
  })

  it('normalizeUsername alone is NOT sufficient — regression guard', () => {
    // This is what the old code relied on; this test exists so a future
    // refactor that drops sanitizeAdminSearch fails loudly.
    expect(normalizeUsername('foo,username.eq.x')).toContain(',')
  })
})
