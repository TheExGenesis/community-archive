import { applyProfileCuration } from './profileCurationState'

const items = [
  { id: '1', label: 'one' },
  { id: '2', label: 'two' },
  { id: '3', label: 'three' },
  { id: '4', label: 'four' },
]

describe('applyProfileCuration', () => {
  test('keeps the generated order when there are no owner overrides', () => {
    expect(applyProfileCuration(items, [], (item) => item.id)).toEqual(items)
  })

  test('hides dismissed items and puts featured items first', () => {
    const result = applyProfileCuration(
      items,
      [
        {
          item_id: '1',
          is_hidden: true,
          is_featured: false,
          position: null,
        },
        {
          item_id: '3',
          is_hidden: false,
          is_featured: true,
          position: null,
        },
      ],
      (item) => item.id,
    )

    expect(result.map((item) => item.id)).toEqual(['3', '2', '4'])
    expect(result[0].curation).toEqual({
      is_featured: true,
      position: null,
    })
  })

  test('uses explicit positions before untouched generated items', () => {
    const result = applyProfileCuration(
      items,
      [
        {
          item_id: '3',
          is_hidden: false,
          is_featured: false,
          position: 0,
        },
        {
          item_id: '1',
          is_hidden: false,
          is_featured: false,
          position: 1,
        },
      ],
      (item) => item.id,
    )

    expect(result.map((item) => item.id)).toEqual(['3', '1', '2', '4'])
  })
})
