import { act, fireEvent, render, screen } from '@testing-library/react'
import { OpportunityBoard } from './OpportunityBoard'
import type { Opportunity } from '@/lib/bulletin/types'
jest.mock('./RefreshButton', () => ({
  RefreshButton: () => <button>Refresh</button>,
}))
jest.mock('./OpportunityBoard.module.css', () => ({}))
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
} as unknown as Opportunity
const ask = {
  ...offer,
  tweet_id: '2',
  side: 'ask',
  kind: 'feedback',
  summary: 'Feedback on a garden',
  topics: ['gardening'],
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
beforeEach(() => {
  jest.useFakeTimers()
  window.history.replaceState(null, '', '/opportunities')
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
    <OpportunityBoard
      opportunities={[offer, ask]}
      now={Date.parse('2026-09-09T00:00:00Z')}
    />,
  )
  expect(fetch).not.toHaveBeenCalled()
  await act(async () => {
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Read full tweet by @alice' })[0],
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
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

  expect(screen.getByText('Original card')).toBeInTheDocument()
  fireEvent.click(
    screen.getByRole('button', { name: 'Collapse tweet by @alice' }),
  )
  expect(screen.queryByText('Original card')).not.toBeInTheDocument()
  expect(screen.queryByText(/Until|On X since/)).not.toBeInTheDocument()
})
test('shows category lanes and combines side, category and search filters', () => {
  render(
    <OpportunityBoard
      opportunities={[offer, ask]}
      now={Date.parse('2026-09-09T00:00:00Z')}
    />,
  )
  expect(screen.getByRole('region', { name: 'Help' })).toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Feedback' })).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Category'), {
    target: { value: 'help' },
  })
  expect(screen.queryByText('Feedback on a garden')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Asks' }))
  expect(screen.queryByText('Help with Python')).not.toBeInTheDocument()
  expect(window.location.hash).toContain('side=ask')
  fireEvent.change(screen.getByLabelText('Filter notices'), {
    target: { value: 'gardening' },
  })
  expect(screen.getByRole('status')).toHaveTextContent('0 of 2 notices')
})
test('past toggle includes expired notices and preserves filters in the URL', () => {
  render(
    <OpportunityBoard
      opportunities={[{ ...offer, expires_at: '2026-09-01' }]}
      now={Date.parse('2026-09-09T00:00:00Z')}
    />,
  )
  expect(screen.getByRole('status')).toHaveTextContent('0 of 1 notices')
  fireEvent.click(screen.getByLabelText('Show past notices'))
  expect(screen.getByRole('status')).toHaveTextContent('1 of 1 notices')
  expect(window.location.hash).toContain('past=1')
  expect(screen.getByText('Help with Python')).toBeInTheDocument()
})

test('coalesces expanded cards and reuses their details after filtering', async () => {
  render(
    <OpportunityBoard
      opportunities={[offer, ask]}
      now={Date.parse('2026-09-09T00:00:00Z')}
    />,
  )
  await act(async () => {
    for (const button of screen.getAllByRole('button', {
      name: 'Read full tweet by @alice',
    }))
      fireEvent.click(button)
  })
  await act(async () => {
    jest.advanceTimersByTime(25)
  })
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(fetch).toHaveBeenCalledWith(
    '/api/bulletin/tweets?ids=1,2',
    expect.any(Object),
  )
  expect(screen.getAllByLabelText('0 likes')).toHaveLength(2)
  fireEvent.change(screen.getByLabelText('Category'), {
    target: { value: 'help' },
  })
  fireEvent.change(screen.getByLabelText('Category'), {
    target: { value: 'all' },
  })
  await act(async () => {
    for (const button of screen.queryAllByRole('button', {
      name: 'Read full tweet by @alice',
    }))
      fireEvent.click(button)
  })
  await act(async () => {
    jest.advanceTimersByTime(25)
  })
  expect(fetch).toHaveBeenCalledTimes(1)
})

test('automatically pages once per sentinel and preserves global search and counts', () => {
  const notices = Array.from({ length: 14 }, (_, i) => ({
    ...offer,
    tweet_id: String(i + 1),
    summary: `Offer number ${i + 1}`,
  }))
  render(
    <OpportunityBoard
      opportunities={notices}
      now={Date.parse('2026-09-09T00:00:00Z')}
    />,
  )
  expect(screen.getByRole('status')).toHaveTextContent('14 of 14 notices')
  expect(screen.getAllByRole('article')).toHaveLength(4)
  expect(
    screen.queryByRole('button', { name: 'Load more Help' }),
  ).not.toBeInTheDocument()
  const sentinel = screen.getByLabelText('Load more Help')
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
  expect(screen.getAllByRole('article')).toHaveLength(8)
  fireEvent.change(screen.getByLabelText('Filter notices'), {
    target: { value: 'Offer number 14' },
  })
  expect(screen.getByText('Offer number 14')).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Load more Help' }),
  ).not.toBeInTheDocument()
})

test('shows verified tweet text immediately before requesting richer cards', () => {
  render(
    <OpportunityBoard
      opportunities={[
        { ...offer, preview_text: 'Verified complete original text' },
      ]}
      now={Date.parse('2026-09-09T00:00:00Z')}
    />,
  )
  expect(
    screen.getByText('Verified complete original text'),
  ).toBeInTheDocument()
  expect(fetch).not.toHaveBeenCalled()
  expect(
    screen.queryByLabelText('Loading original tweet'),
  ).not.toBeInTheDocument()
})

const page = (notices: Opportunity[], cursor: string | null = null) => ({
  opportunities: notices,
  counts: { help: 8 },
  cursors: { help: cursor },
  total: 8,
  now: Date.parse('2026-09-09T00:00:00Z'),
  personal: { account_id: '', username: '', outgoing: {}, available: false },
})
test('requests and appends a server page on scroll without fetching tweet details', async () => {
  const initial = page([offer], '1')
  const more = { ...offer, tweet_id: '3', summary: 'Another offer' }
  jest
    .mocked(fetch)
    .mockResolvedValue({ ok: true, json: async () => page([more]) } as Response)
  render(
    <OpportunityBoard
      opportunities={[offer]}
      initialPage={initial}
      now={initial.now}
    />,
  )
  expect(fetch).not.toHaveBeenCalled()
  const sentinel = screen.getByLabelText('Load more Help')
  const callback = intersections.find((cb) => observed.get(cb) === sentinel)!
  await act(async () => {
    callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    )
  })
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(String(jest.mocked(fetch).mock.calls[0][0])).toContain('kind=help')
  expect(String(jest.mocked(fetch).mock.calls[0][0])).toContain('after=1')
  expect(screen.getByText('Help with Python')).toBeInTheDocument()
  expect(screen.getByText('Another offer')).toBeInTheDocument()
  expect(screen.queryByLabelText('Load more Help')).not.toBeInTheDocument()
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
    <OpportunityBoard
      opportunities={[offer]}
      initialPage={initial}
      now={initial.now}
    />,
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
