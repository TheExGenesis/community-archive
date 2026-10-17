import { groupShelf, mapShelfRow, shapeShelf, type ShelfDbRow } from './shape'
import { shelfDecisionFor } from './types'

const key = (value: string) => `k${value.length}`.padEnd(32, '0')
const row = (overrides: Partial<ShelfDbRow> = {}): ShelfDbRow => ({
  work_key: 'book:dune|frank herbert',
  shelf_row: 'books',
  medium: 'book',
  label: 'Dune',
  needs_title: false,
  creator: 'Frank Herbert',
  url: null,
  marks: ['recommended', 'loved'],
  evidence_tweet_ids: ['10', '11', '10'],
  first_at: '2020-01-01T00:00:00Z',
  last_at: '2021-01-01T00:00:00Z',
  image_url: 'https://covers.openlibrary.org/b/id/1-L.jpg',
  image_source: 'openlibrary',
  status: 'approved',
  computed_at: '2026-10-08T00:00:00Z',
  ...overrides,
})

describe('mapShelfRow', () => {
  it('maps to camelCase with ordered unique marks and evidence', () => {
    const item = mapShelfRow('42', row(), key)!
    expect(item).toMatchObject({
      workKey: 'book:dune|frank herbert',
      row: 'books',
      label: 'Dune',
      creator: 'Frank Herbert',
      marks: ['loved', 'recommended'],
      evidenceTweetIds: ['10', '11'],
      status: 'approved',
      imageSource: 'openlibrary',
    })
    expect(item.coverPath).toMatch(
      /^\/api\/shelf\/cover\?account_id=42&key=[0-9a-z]{32}&v=/,
    )
  })

  it('never exposes the remote image URL or non-https images', () => {
    expect(mapShelfRow('42', row(), key)!.coverPath).not.toContain(
      'openlibrary',
    )
    expect(
      mapShelfRow('42', row({ image_url: 'http://x.test/a.png' }), key)!
        .coverPath,
    ).toBeNull()
    expect(mapShelfRow('42', row({ image_url: null }), key)!.coverPath).toBe(
      null,
    )
  })

  it('drops rows outside the contract and normalizes the rest', () => {
    expect(mapShelfRow('42', row({ shelf_row: 'shoes' }), key)).toBeNull()
    expect(mapShelfRow('42', row({ work_key: 'ab' }), key)).toBeNull()
    const item = mapShelfRow(
      '42',
      row({
        status: 'weird',
        marks: ['loved', 'meh'],
        evidence_tweet_ids: ['1', 'x'],
        url: 'javascript:alert(1)',
        creator: '  ',
      }),
      key,
    )!
    expect(item.status).toBe('pending')
    expect(mapShelfRow('42', row({ status: 'changed' }), key)!.status).toBe(
      'changed',
    )
    expect(mapShelfRow('42', row({ status: 'hidden' }), key)!.status).toBe(
      'hidden',
    )
    expect(item.marks).toEqual(['loved'])
    expect(item.evidenceTweetIds).toEqual(['1'])
    expect(item.url).toBeNull()
    expect(item.creator).toBeNull()
  })
})

describe('groupShelf', () => {
  it('orders rows by medium and items by evidence, then recency, once each', () => {
    const shelf = shapeShelf(
      '42',
      [
        row({ work_key: 'tool:figma', shelf_row: 'tools', label: 'Figma' }),
        row({
          work_key: 'book:a',
          evidence_tweet_ids: ['1'],
          last_at: '2024-01-01T00:00:00Z',
        }),
        row({ work_key: 'book:b', evidence_tweet_ids: ['1', '2', '3'] }),
        row({
          work_key: 'book:c',
          evidence_tweet_ids: ['1'],
          last_at: '2025-01-01T00:00:00Z',
        }),
        row({ work_key: 'book:b', evidence_tweet_ids: ['9'] }),
        row({ work_key: 'mention:x', shelf_row: 'mentioned' }),
        row({ work_key: 'made:y', shelf_row: 'made' }),
      ],
      key,
    )
    expect(shelf.rows.map((r) => r.key)).toEqual([
      'books',
      'tools',
      'made',
      'mentioned',
    ])
    expect(shelf.rows[0].items.map((i) => i.workKey)).toEqual([
      'book:b',
      'book:c',
      'book:a',
    ])
    expect(shelf.rows[0].items[0].evidenceTweetIds).toEqual(['1', '2', '3'])
    expect(shelf.total).toBe(6)
  })

  it('returns no rows for an empty shelf', () => {
    expect(groupShelf('42', [])).toEqual({
      accountId: '42',
      rows: [],
      total: 0,
    })
  })
})

describe('shelfDecisionFor', () => {
  it('keeps a changed item in review instead of re-approving it', () => {
    expect(shelfDecisionFor('changed')).toBe('pending')
    expect(shelfDecisionFor('approved')).toBe('approved')
    expect(shelfDecisionFor('hidden')).toBe('hidden')
    expect(shelfDecisionFor('pending')).toBe('pending')
  })
})
