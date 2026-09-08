import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SourcePosts } from './SourcePosts'
jest.mock('@/components/TweetCard', () => ({
  TweetCard: ({ tweet }: { tweet: { text: string } }) => (
    <article>{tweet.text}</article>
  ),
}))
let intersect: (entries: { isIntersecting: boolean }[]) => void
beforeEach(() => {
  global.IntersectionObserver = jest.fn().mockImplementation((callback) => {
    intersect = callback
    return { observe: jest.fn(), disconnect: jest.fn() }
  })
  global.fetch = jest.fn()
})
test('loads on approach, retains earlier posts, retries a failed batch, and stops at the end', async () => {
  jest
    .mocked(fetch)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tweets: [{ id: '1', username: 'alice', text: 'First source' }],
        nextOffset: 6,
      }),
    } as Response)
    .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tweets: [{ id: '2', username: 'bob', text: 'Last source' }],
        nextOffset: null,
      }),
    } as Response)
  render(<SourcePosts username="alice" clusterId="topic" total={12} />)
  expect(fetch).not.toHaveBeenCalled()
  act(() => intersect([{ isIntersecting: true }]))
  expect(await screen.findByText('First source')).toBeInTheDocument()
  act(() => intersect([{ isIntersecting: true }]))
  expect(await screen.findByRole('alert')).toHaveTextContent('could not load')
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByText('Last source')).toBeInTheDocument()
  expect(screen.getByText('First source')).toBeInTheDocument()
  expect(screen.getByText('By @alice')).toBeInTheDocument()
  expect(screen.getByText('Conversation context · @bob')).toBeInTheDocument()
  await waitFor(() =>
    expect(screen.queryByRole('button')).not.toBeInTheDocument(),
  )
  expect(jest.mocked(fetch).mock.calls.map(([url]) => String(url))).toEqual([
    '/api/birdseye/sources?username=alice&cluster_id=topic&offset=0',
    '/api/birdseye/sources?username=alice&cluster_id=topic&offset=6',
    '/api/birdseye/sources?username=alice&cluster_id=topic&offset=6',
  ])
})
