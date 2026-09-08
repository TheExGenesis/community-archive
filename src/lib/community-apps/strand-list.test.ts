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

test('ranks title and handwritten labels, seed text, usernames, then summary before rating', async () => {
  const base = {
    title: 'Other',
    text: '',
    username: 'writer',
    participants: [],
    summary: 'Other',
    rating: 0,
  }
  ;(getStrands as jest.Mock).mockResolvedValue({
    strands: [
      { ...base, id: 'summary', summary: 'Portal story', rating: 100 },
      { ...base, id: 'username', username: 'portal', rating: 90 },
      {
        ...base,
        id: 'participant',
        participants: ['PortalFriend'],
        rating: 80,
      },
      { ...base, id: 'text', text: 'Building PORTAL together', rating: 70 },
      { ...base, id: 'title', title: 'Portal', rating: 60 },
      { ...base, id: 'label', mapLabel: 'Portal in Porto', rating: 50 },
      { ...base, id: 'absent', rating: 200 },
    ],
  })
  ;(getStrandTweets as jest.Mock).mockResolvedValue(new Map())
  expect((await getStrandPage(' PORTAL ', 0)).items.map((s) => s.id)).toEqual([
    'title',
    'label',
    'text',
    'username',
    'participant',
    'summary',
  ])
  expect((await getStrandPage('', 0)).items[0].id).toBe('absent')
})
