import {
  countByKind,
  filtersFromParams,
  filtersToQuery,
  libraryShard,
  selectWorks,
  yearSpan,
  type LibraryWork,
} from './library'

const work = (over: Partial<LibraryWork>): LibraryWork => ({
  id: 'a',
  k: 'essay',
  t: 'Meditations On Moloch',
  s: 'Slate Star Codex',
  d: '',
  u: 'https://example.org',
  n: 3,
  tw: 4,
  l: 10,
  f: 1400000000,
  la: 1700000000,
  by: 'link',
  ...over,
})

describe('library filters', () => {
  it('round-trips through the query string and drops defaults', () => {
    const f = filtersFromParams(new URLSearchParams('kind=book&q=dune&sort=likes'))
    expect(f).toEqual({ kind: 'book', q: 'dune', sort: 'likes' })
    expect(filtersToQuery(f)).toBe('?kind=book&q=dune&sort=likes')
    expect(filtersToQuery({ kind: '', q: '', sort: 'members' })).toBe('')
  })

  it('ignores unknown kinds and sorts', () => {
    expect(filtersFromParams(new URLSearchParams('kind=nope&sort=x'))).toEqual({
      kind: '',
      q: '',
      sort: 'members',
    })
  })

  it('filters by kind and text, then sorts', () => {
    const works = [
      work({ id: 'a', n: 3, l: 50 }),
      work({ id: 'b', k: 'book', t: 'Impro', s: 'by Keith Johnstone', n: 9, l: 5 }),
      work({ id: 'c', k: 'book', t: 'Dune', s: 'by Frank Herbert', n: 4, l: 80 }),
    ]
    const ids = (f: Parameters<typeof selectWorks>[1]) =>
      selectWorks(works, f).map((w) => w.id)
    expect(ids({ kind: '', q: '', sort: 'members' })).toEqual(['b', 'c', 'a'])
    expect(ids({ kind: 'book', q: '', sort: 'likes' })).toEqual(['c', 'b'])
    expect(ids({ kind: '', q: 'johnstone', sort: 'members' })).toEqual(['b'])
    expect(countByKind(works).get('book')).toBe(2)
  })

  it('shows one year or a span', () => {
    expect(yearSpan(work({}))).toBe('2014–2023')
    expect(yearSpan(work({ la: 1400000001 }))).toBe('2014')
  })
})

describe('libraryShard', () => {
  it('matches the worker and gateway for known ids', () => {
    // Same vectors as ops/clickhouse-query-gateway/library.test.mjs.
    expect(libraryShard('8c73d1c977', 32)).toBe(10)
    expect(libraryShard('11f6ad8ec5', 32)).toBe(18)
  })
})
