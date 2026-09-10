import { act, fireEvent, render, screen } from '@testing-library/react'
import { StrandThreadContext } from './StrandThreadContext'
import type { PortalTweet } from '@/lib/portal/types'
jest.mock('@/components/TweetCard', () => ({
  __esModule: true,
  default: ({ tweet }: { tweet: PortalTweet }) => (
    <article>{tweet.text}</article>
  ),
}))
beforeEach(() => {
  global.fetch = jest.fn()
})
const result = {
  before: [{ id: '1', text: 'Before' }],
  after: [{ id: '3', text: 'After' }],
}
test('automatically shows before, selected, and after in order without a duplicate selected card', async () => {
  ;(fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => result,
  })
  render(
    <StrandThreadContext seedId="2" tweetId="2">
      <article>Selected</article>
    </StrandThreadContext>,
  )
  await screen.findByText('After')
  expect(screen.getAllByRole('article').map((el) => el.textContent)).toEqual([
    'Before',
    'Selected',
    'After',
  ])
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(screen.queryByText('Show thread context')).not.toBeInTheDocument()
})
test('timeline context stays lazy and failures offer an explicit retry', async () => {
  ;(fetch as jest.Mock)
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValueOnce({ ok: true, json: async () => result })
  render(<StrandThreadContext seedId="2" tweetId="2" />)
  expect(fetch).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('Show thread context'))
  await screen.findByRole('alert')
  expect(fetch).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByText('Try again'))
  await screen.findByText('After')
  expect(fetch).toHaveBeenCalledTimes(2)
})
test('switching selected posts aborts the previous request and ignores its late response', async () => {
  let resolveOld!: (value: unknown) => void
  ;(fetch as jest.Mock)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve
        }),
    )
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ before: [], after: [] }),
    })
  const { rerender } = render(
    <StrandThreadContext key="2" seedId="2" tweetId="2">
      <article>Old</article>
    </StrandThreadContext>,
  )
  const signal = (fetch as jest.Mock).mock.calls[0][1].signal
  rerender(
    <StrandThreadContext key="4" seedId="2" tweetId="4">
      <article>New</article>
    </StrandThreadContext>,
  )
  await screen.findByText(/No surrounding posts/)
  await act(async () => resolveOld({ ok: true, json: async () => result }))
  expect(signal.aborted).toBe(true)
  expect(screen.getAllByRole('article').map((el) => el.textContent)).toEqual([
    'New',
  ])
})
