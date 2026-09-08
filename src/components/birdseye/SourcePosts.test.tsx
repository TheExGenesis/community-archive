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
        tweets: [
          { id: '1', threadId: '1', username: 'alice', text: 'First source' },
        ],
        nextOffset: 6,
      }),
    } as Response)
    .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tweets: [
          { id: '2', threadId: '1', username: 'bob', text: 'Last source' },
        ],
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
  expect(
    screen.getByRole('group', { name: 'Reply thread · 2 posts' }),
  ).toHaveTextContent('First source')
  expect(
    screen.getByRole('group', { name: 'Reply thread · 2 posts' }),
  ).toHaveTextContent('Last source')
  expect(screen.getByText('By @alice')).toBeInTheDocument()
  expect(screen.getByText('Conversation context · @bob')).toBeInTheDocument()
  await waitFor(() =>
    expect(
      screen.queryByRole('button', { name: 'Load more posts' }),
    ).not.toBeInTheDocument(),
  )
  expect(jest.mocked(fetch).mock.calls.map(([url]) => String(url))).toEqual([
    '/api/birdseye/sources?username=alice&cluster_id=topic&offset=0&sort=recent',
    '/api/birdseye/sources?username=alice&cluster_id=topic&offset=6&sort=recent',
    '/api/birdseye/sources?username=alice&cluster_id=topic&offset=6&sort=recent',
  ])
})

test('changing sort clears the previous feed and restarts pagination', async () => {
  jest
    .mocked(fetch)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tweets: [{ id: '1', username: 'alice', text: 'Recent post' }],
        nextOffset: 6,
      }),
    } as Response)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tweets: [{ id: '2', username: 'alice', text: 'Liked post' }],
        nextOffset: null,
      }),
    } as Response)
  render(<SourcePosts username="alice" clusterId="topic" total={12} />)
  fireEvent.click(screen.getByRole('button', { name: 'Load more posts' }))
  expect(await screen.findByText('Recent post')).toBeInTheDocument()
  fireEvent.change(screen.getByRole('combobox', { name: 'Order posts' }), {
    target: { value: 'likes' },
  })
  expect(screen.queryByText('Recent post')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Load more posts' }))
  expect(await screen.findByText('Liked post')).toBeInTheDocument()
  expect(fetch).toHaveBeenLastCalledWith(
    '/api/birdseye/sources?username=alice&cluster_id=topic&offset=0&sort=likes',
    expect.anything(),
  )
})
