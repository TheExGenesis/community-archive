import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { BulletinBoard, dealStacks, sinceLabel } from './BulletinBoard'
import type { Notice } from '@/lib/bulletin/types'
jest.mock('./BulletinBoard.module.css', () => ({}))
const offer = {
  tweet_id: '1',
  account_id: 'a',
  username: 'alice',
  posted_at: '2026-09-08T00:00:00Z',
  preview_text: 'Happy to help with Python.',
  side: 'offer',
  kind: 'help',
  summary: 'Help with Python',
  evidence: 'Happy to help',
  topics: ['python'],
  respond: 'dm',
  standing: false,
  expires_at: null,
  place: null,
  model: 'test',
} as unknown as Notice
const ask = {
  ...offer,
  tweet_id: '2',
  account_id: 'b',
  username: 'bob',
  side: 'ask',
  kind: 'feedback',
  summary: 'Feedback on a garden',
  topics: ['gardening'],
  replies: 0,
  quotes: 0,
}
jest.mock('@/components/TweetCard', () => ({
  TweetCard: ({ tweet }: { tweet: { text?: string } }) => (
    <div>
      Original card<span>{tweet.text}</span>
    </div>
  ),
}))
jest.mock('@/components/TweetAvatar', () => ({
  TweetAvatar: () => <span />,
}))
let intersections: IntersectionObserverCallback[]
let observed: Map<IntersectionObserverCallback, Element>
const category = () => screen.getByRole('group', { name: 'Category' })
const chip = (name: RegExp) => within(category()).getByRole('button', { name })
beforeEach(() => {
  jest.useFakeTimers()
  window.history.replaceState(null, '', '/bulletin')
  intersections = []
  observed = new Map()
  window.IntersectionObserver = jest.fn((callback) => {
    intersections.push(callback)
    return {
      observe: (element: Element) => observed.set(callback, element),
      disconnect: jest.fn(),
    }
  }) as unknown as typeof IntersectionObserver
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      tweets: [
        { id: '1', likes: 0 },
        { id: '2', likes: 0 },
      ],
    }),
  })
})
afterEach(() => jest.useRealTimers())
test('loads full details only on inline expansion', async () => {
  render(
    <BulletinBoard
      notices={[offer, ask]}
      now={Date.parse('2026-09-09T00:00:00Z')}
    />,
  )
  expect(fetch).not.toHaveBeenCalled()
  await act(async () => {
    fireEvent.click(
      screen.getByRole('button', { name: 'Read full tweet by @alice' }),
    )
  })
  await act(async () => {
    jest.advanceTimersByTime(25)
  })
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(fetch).toHaveBeenCalledWith(
    '/api/bulletin/tweets?ids=1',
    expect.objectContaining({ cache: 'no-store' }),
  )
  expect(screen.getByText('Original card')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Open on X' })).toHaveAttribute(
    'href',
    'https://twitter.com/alice/status/1',
  )
  expect(screen.getByRole('link', { name: 'DM on X' })).toHaveAttribute(
    'href',
    'https://twitter.com/messages/compose?recipient_id=a',
  )
  expect(screen.queryByText('Help with Python')).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '@alice' })).not.toBeInTheDocument()
  fireEvent.click(
    screen.getByRole('button', { name: 'Collapse tweet by @alice' }),
  )
  expect(screen.queryByText('Original card')).not.toBeInTheDocument()
  expect(screen.getByText('Help with Python')).toBeInTheDocument()
})
test('shows one stream with combined labels, and combines side, category and search filters', () => {
  render(
    <BulletinBoard
      notices={[offer, ask]}
      now={Date.parse('2026-09-09T00:00:00Z')}
    />,
  )
  expect(screen.queryByRole('region')).not.toBeInTheDocument()
  const cards = screen.getAllByRole('article')
  expect(cards).toHaveLength(2)
  expect(within(cards[0]).getByText('Feedback wanted')).toBeInTheDocument()
  expect(within(cards[1]).getByText('Help')).toBeInTheDocument()
  expect(
    screen.queryByLabelText(/replies from archived members/),
  ).not.toBeInTheDocument()
  for (const card of cards)
    expect(card).not.toHaveTextContent(/until|standing|answered|taken up/)
  fireEvent.click(chip(/^Help/))
  expect(screen.queryByText('Feedback on a garden')).not.toBeInTheDocument()
  expect(window.location.hash).toContain('kind=help')
  fireEvent.click(screen.getByRole('button', { name: /^Asks/ }))
  expect(screen.queryByText('Help with Python')).not.toBeInTheDocument()
  expect(window.location.hash).toContain('side=ask')
  fireEvent.click(chip(/^Help/))
  expect(window.location.hash).not.toContain('kind=')
  expect(screen.getByText('Feedback on a garden')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /^All/ }))
  fireEvent.click(chip(/^Help/))
  fireEvent.click(chip(/^Feedback/))
  expect(window.location.hash).toContain('kind=feedback%2Chelp')
  expect(screen.getAllByRole('article')).toHaveLength(2)
  fireEvent.click(chip(/^Help/))
  expect(window.location.hash).toContain('kind=feedback')
  expect(screen.getAllByRole('article')).toHaveLength(1)
  fireEvent.click(chip(/^Feedback/))
  fireEvent.change(screen.getByLabelText('Filter notices'), {
    target: { value: 'gardening' },
  })
  expect(screen.getByRole('status')).toHaveTextContent('1 notice')
  fireEvent.change(screen.getByLabelText('Filter notices'), {
    target: { value: 'nothing here' },
  })
  expect(screen.getByRole('status')).toHaveTextContent('0 notices')
})
test('past toggle includes expired notices and preserves filters in the URL', () => {
  render(
    <BulletinBoard
      notices={[{ ...offer, expires_at: '2026-09-01' }]}
      now={Date.parse('2026-09-09T00:00:00Z')}
    />,
  )
  expect(screen.getByRole('status')).toHaveTextContent('0 notices')
  fireEvent.click(screen.getByLabelText('Show past notices'))
  expect(screen.getByRole('status')).toHaveTextContent('1 notice')
  expect(window.location.hash).toContain('past=1')
  expect(screen.getByText('Help with Python')).toBeInTheDocument()
  expect(screen.getByText('ended Sep 1')).toBeInTheDocument()
})
test('shows the ledger and relationship words only from own account and outgoing counts', () => {
  render(
    <BulletinBoard
      notices={[
        offer,
        { ...ask, replies: 2, quotes: 1, reply_account_ids: ['a'] },
      ]}
      me="a"
      username="alice"
      graph={{
        outgoing: { b: 4 },
        available: true,
        following: ['b'],
        followers: ['a', 'b'],
      }}
      now={Date.parse('2026-09-09T00:00:00Z')}
    />,
  )
  const cards = screen.getAllByRole('article')
  expect(cards[1]).toHaveTextContent('mutual')
  expect(cards[1]).toHaveTextContent('you replied')
  expect(cards[0]).not.toHaveTextContent('you replied')
  expect(
    screen.getByLabelText('3 replies from archived members'),
  ).toBeInTheDocument()
  expect(cards[0]).not.toHaveTextContent(/mutual|following|follows you/)
  expect(cards[0]).not.toHaveTextContent('· you')
  expect(cards[1]).not.toHaveTextContent('near you')
})
test('coalesces expanded cards and reuses their details after filtering', async () => {
  render(
    <BulletinBoard
      notices={[offer, ask]}
      now={Date.parse('2026-09-09T00:00:00Z')}
    />,
  )
  await act(async () => {
    fireEvent.click(
      screen.getByRole('button', { name: 'Read full tweet by @alice' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Read full tweet by @bob' }),
    )
  })
  await act(async () => {
    jest.advanceTimersByTime(25)
  })
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(String(jest.mocked(fetch).mock.calls[0][0])).toMatch(/ids=(1,2|2,1)$/)
  fireEvent.click(chip(/^Help/))
  fireEvent.click(chip(/^Help/))
  await act(async () => {
    for (const button of screen.queryAllByRole('button', {
      name: /Read full tweet by/,
    }))
      fireEvent.click(button)
  })
  await act(async () => {
    jest.advanceTimersByTime(25)
  })
  expect(fetch).toHaveBeenCalledTimes(1)
})

test('automatically pages once per sentinel and preserves global search and counts', () => {
  const notices = Array.from({ length: 40 }, (_, i) => ({
    ...offer,
    tweet_id: String(i + 1),
    summary: `Offer number ${i + 1}`,
  }))
  render(
    <BulletinBoard
      notices={notices}
      now={Date.parse('2026-09-09T00:00:00Z')}
    />,
  )
  expect(screen.getByRole('status')).toHaveTextContent('18 of 40 notices')
  expect(screen.getAllByRole('article')).toHaveLength(18)
  expect(
    screen.queryByRole('button', { name: 'Show more' }),
  ).not.toBeInTheDocument()
  const sentinel = screen.getByLabelText('Load more notices')
  const nextPage = intersections.find(
    (callback) => observed.get(callback) === sentinel,
  )!
  act(() => {
    nextPage(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    )
    nextPage(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    )
  })
  expect(screen.getAllByRole('article')).toHaveLength(36)
  fireEvent.change(screen.getByLabelText('Filter notices'), {
    target: { value: 'Offer number 40' },
  })
  expect(screen.getByText('Offer number 40')).toBeInTheDocument()
  expect(screen.queryByLabelText('Load more notices')).not.toBeInTheDocument()
})

test('expands to verified text before richer details arrive', async () => {
  jest.mocked(fetch).mockImplementation(() => new Promise(() => {}))
  render(
    <BulletinBoard
      notices={[{ ...offer, preview_text: 'Verified complete original text' }]}
      now={Date.parse('2026-09-09T00:00:00Z')}
    />,
  )
  expect(
    screen.queryByText('Verified complete original text'),
  ).not.toBeInTheDocument()
  await act(async () => {
    fireEvent.click(
      screen.getByRole('button', { name: 'Read full tweet by @alice' }),
    )
  })
  expect(
    screen.getByText('Verified complete original text'),
  ).toBeInTheDocument()
  expect(screen.getByText('Loading post details…')).toBeInTheDocument()
})

const page = (notices: Notice[], cursor: string | null = null) => ({
  notices,
  counts: { help: 8, offer: 8, ask: 0 },
  cursors: { all: cursor },
  total: 8,
  now: Date.parse('2026-09-09T00:00:00Z'),
  personal: {
    account_id: '',
    username: '',
    outgoing: {},
    available: false,
    following: [],
    followers: [],
  },
})
test('requests and appends a server page on scroll without fetching tweet details', async () => {
  const initial = page([offer], '1')
  const more = { ...offer, tweet_id: '3', summary: 'Another offer' }
  jest
    .mocked(fetch)
    .mockResolvedValue({ ok: true, json: async () => page([more]) } as Response)
  render(
    <BulletinBoard notices={[offer]} initialPage={initial} now={initial.now} />,
  )
  expect(fetch).not.toHaveBeenCalled()
  expect(chip(/^Help/)).toHaveTextContent('8')
  expect(screen.getByRole('button', { name: /^Offers/ })).toHaveTextContent('8')
  const sentinel = screen.getByLabelText('Load more notices')
  const callback = intersections.find((cb) => observed.get(cb) === sentinel)!
  await act(async () => {
    callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    )
  })
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(String(jest.mocked(fetch).mock.calls[0][0])).toContain('kind=all')
  expect(String(jest.mocked(fetch).mock.calls[0][0])).toContain('after=1')
  expect(screen.getByText('Help with Python')).toBeInTheDocument()
  expect(screen.getByText('Another offer')).toBeInTheDocument()
  expect(screen.queryByLabelText('Load more notices')).not.toBeInTheDocument()
})
test('searches the server for unloaded matches and ignores stale filter responses', async () => {
  const initial = page([offer])
  let resolveOld!: (value: Response) => void
  jest.mocked(fetch).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve
      }),
  )
  jest.mocked(fetch).mockResolvedValueOnce({
    ok: true,
    json: async () =>
      page([{ ...offer, tweet_id: '99', summary: 'Unloaded match' }]),
  } as Response)
  render(
    <BulletinBoard notices={[offer]} initialPage={initial} now={initial.now} />,
  )
  fireEvent.change(screen.getByLabelText('Filter notices'), {
    target: { value: 'old' },
  })
  await act(async () => {
    jest.advanceTimersByTime(200)
  })
  fireEvent.change(screen.getByLabelText('Filter notices'), {
    target: { value: 'Unloaded match' },
  })
  await act(async () => {
    jest.advanceTimersByTime(200)
  })
  await act(async () => {
    resolveOld({ ok: true, json: async () => page([offer]) } as Response)
  })
  expect(screen.getByText('Unloaded match')).toBeInTheDocument()
  expect(screen.queryByText('Help with Python')).not.toBeInTheDocument()
})
test('clicking a kind on a card filters to that kind and clicking again clears it', () => {
  render(
    <BulletinBoard
      notices={[offer, ask]}
      now={Date.parse('2026-09-09T00:00:00Z')}
    />,
  )
  fireEvent.click(
    screen.getAllByRole('button', { name: 'Filter by Feedback' })[0],
  )
  expect(window.location.hash).toContain('kind=feedback')
  expect(screen.getAllByRole('article')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Filter by Feedback' }))
  expect(window.location.hash).not.toContain('kind=')
  expect(screen.getAllByRole('article')).toHaveLength(2)
})
test('clicking anywhere on a closed card expands it, except links and buttons', async () => {
  render(
    <BulletinBoard
      notices={[offer]}
      now={Date.parse('2026-09-09T00:00:00Z')}
    />,
  )
  fireEvent.click(screen.getByRole('link', { name: '@alice' }))
  expect(screen.queryByText('Original card')).not.toBeInTheDocument()
  await act(async () => {
    fireEvent.click(screen.getByRole('article'))
  })
  expect(screen.getByText('Original card')).toBeInTheDocument()
})
test('renders member replies beneath the expanded tweet', async () => {
  jest.mocked(fetch).mockResolvedValue({
    ok: true,
    json: async () => ({
      tweets: [
        {
          id: '1',
          likes: 0,
          text: 'Original text',
          replies: [
            { id: '9', username: 'ray', name: 'Ray', text: 'A helpful reply' },
          ],
        },
      ],
    }),
  } as Response)
  render(
    <BulletinBoard
      notices={[offer]}
      now={Date.parse('2026-09-09T00:00:00Z')}
    />,
  )
  await act(async () => {
    fireEvent.click(
      screen.getByRole('button', { name: 'Read full tweet by @alice' }),
    )
  })
  await act(async () => {
    jest.advanceTimersByTime(25)
  })
  expect(screen.getByText('1 reply from members')).toBeInTheDocument()
  expect(screen.getByText('A helpful reply')).toBeInTheDocument()
})
test('dates read as time since posting, with the exact stamp on hover', () => {
  const now = Date.parse('2026-09-09T12:00:00Z')
  expect(sinceLabel('2026-09-09T11:59:30Z', now)).toBe('just now')
  expect(sinceLabel('2026-09-09T09:00:00Z', now)).toBe('3h ago')
  expect(sinceLabel('2026-09-05T12:00:00Z', now)).toBe('4d ago')
  expect(sinceLabel('2026-08-19T12:00:00Z', now)).toBe('3wk ago')
  expect(sinceLabel('2026-06-10T12:00:00Z', now)).toBe('Jun 10')
  expect(sinceLabel('2025-06-10T12:00:00Z', now)).toBe('Jun 10, 2025')
  render(<BulletinBoard notices={[offer]} now={now} />)
  expect(screen.getByText('2d ago')).toHaveAttribute(
    'title',
    'Sep 8, 2026, 00:00 UTC',
  )
})
test('deals cards round-robin into three stacks and keeps rank order via style order', () => {
  expect(dealStacks([1, 2, 3, 4, 5, 6, 7])).toEqual([
    [1, 4, 7],
    [2, 5],
    [3, 6],
  ])
  const notices = Array.from({ length: 6 }, (_, i) => ({
    ...offer,
    tweet_id: String(i + 1),
    posted_at: new Date(
      Date.parse('2026-09-08T00:00:00Z') - i * 3600000,
    ).toISOString(),
    summary: `Offer number ${i + 1}`,
  }))
  render(
    <BulletinBoard
      notices={notices}
      now={Date.parse('2026-09-09T00:00:00Z')}
    />,
  )
  const stacks = screen.getAllByTestId('stack')
  expect(stacks).toHaveLength(3)
  expect(
    within(stacks[0])
      .getAllByRole('article')
      .map((a) => a.textContent),
  ).toEqual([
    expect.stringContaining('Offer number 1'),
    expect.stringContaining('Offer number 4'),
  ])
  expect(within(stacks[1]).getAllByRole('article')[1]).toHaveTextContent(
    'Offer number 5',
  )
  expect(within(stacks[1]).getAllByRole('article')[1]).toHaveStyle({
    order: 4,
  })
})
