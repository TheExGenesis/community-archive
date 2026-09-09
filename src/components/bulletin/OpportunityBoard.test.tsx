import { act, fireEvent, render, screen } from '@testing-library/react'
import { OpportunityBoard } from './OpportunityBoard'
import type { Opportunity } from '@/lib/bulletin/types'
const offer = {
  tweet_id: '1',
  account_id: 'a',
  username: 'alice',
  posted_at: '2026-09-08T00:00:00Z',
  full_text: 'Happy to help with Python.',
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
  TweetCard: () => <div>Original card</div>,
}))
jest.mock('@/components/portal/TweetRow', () => ({
  TweetAvatar: () => <span />,
}))
let intersections: IntersectionObserverCallback[]
beforeEach(() => {
  window.history.replaceState(null, '', '/opportunities')
  intersections = []
  window.IntersectionObserver = jest.fn((callback) => {
    intersections.push(callback)
    return { observe: jest.fn(), disconnect: jest.fn() }
  }) as unknown as typeof IntersectionObserver
  global.fetch = jest
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ id: '1' }) })
})
test('loads the original automatically near the viewport without fetching every notice', async () => {
  render(
    <OpportunityBoard
      opportunities={[offer, ask]}
      now={Date.parse('2026-09-09T00:00:00Z')}
    />,
  )
  expect(fetch).not.toHaveBeenCalled()
  await act(async () => {
    intersections[0](
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    )
  })
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(fetch).toHaveBeenCalledWith(
    '/api/bulletin/tweet/1',
    expect.objectContaining({ cache: 'no-store' }),
  )
  expect(screen.getByText('Original card')).toBeInTheDocument()
  expect(screen.queryByText(/Until|On X since/)).not.toBeInTheDocument()
})
test('shows ask/offer columns and combines category and search filters', () => {
  render(
    <OpportunityBoard
      opportunities={[offer, ask]}
      now={Date.parse('2026-09-09T00:00:00Z')}
    />,
  )
  expect(screen.getByRole('region', { name: 'Offers' })).toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Asks' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Help 1' }))
  expect(screen.queryByText('Feedback on a garden')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Search opportunities'), {
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
