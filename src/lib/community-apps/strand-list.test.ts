import { getStrandPage } from './strand-list'
import { getStrands } from './data'
import { getStrandTweets } from './strand-tweets'
jest.mock('./data', () => ({ getStrands: jest.fn() }))
jest.mock('./strand-tweets', () => ({ getStrandTweets: jest.fn() }))
test('search and pagination hydrate at most 24 policy-filtered seeds, with stable order', async () => {
  ;(getStrands as jest.Mock).mockResolvedValue({
    strands: Array.from({ length: 27 }, (_, i) => ({
      id: String(i + 1),
      title: 'Portal',
      mapLabel: 'Vibetober',
      summary: 'Story\n\nMore',
      username: 'author',
      rating: 27 - i,
    })),
  })
  ;(getStrandTweets as jest.Mock).mockResolvedValue(new Map())
  const first = await getStrandPage('portal', 0)
  expect(first.items).toHaveLength(24)
  expect(first.nextOffset).toBe(24)
  expect((getStrandTweets as jest.Mock).mock.calls[0][0]).toHaveLength(24)
  const last = await getStrandPage('portal', 24)
  expect(last.items.map((s) => s.id)).toEqual(['25', '26', '27'])
  expect(last.nextOffset).toBeNull()
  expect(last.items[0].summary).toBe('Story')
  expect((await getStrandPage('no match', 0)).items).toEqual([])
  expect((await getStrandPage('Vibetober', 0)).total).toBe(27)
})
