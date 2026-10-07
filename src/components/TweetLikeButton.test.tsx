import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TweetLikeButton } from './TweetLikeButton'
import { resetTweetLikesForTests } from '@/lib/tweetLikes/client'

const json = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as Response

describe('TweetLikeButton', () => {
  const fetchMock = jest.fn()

  beforeEach(() => {
    jest.useFakeTimers()
    resetTweetLikesForTests()
    fetchMock.mockReset()
    global.fetch = fetchMock
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  const hydrate = async () => {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(50)
    })
  }

  it('hydrates every button on the page from one batched request', async () => {
    fetchMock.mockResolvedValue(
      json({ signedIn: true, likes: { '11': { count: 4, liked: true } } }),
    )
    render(
      <>
        <TweetLikeButton tweetId="11" xLikeCount={10} />
        <TweetLikeButton tweetId="12" xLikeCount={0} />
        <TweetLikeButton tweetId="t_fixture" xLikeCount={0} />
      </>,
    )
    await hydrate()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/tweets/likes?ids=11,12')
    const [liked, unliked] = screen.getAllByRole('button')
    // Fixture ids are never looked up, so they can never be liked.
    expect(screen.getAllByRole('button')[2]).toBeDisabled()
    expect(liked).toHaveAttribute('aria-pressed', 'true')
    expect(liked).toHaveTextContent('14 likes')
    expect(unliked).toHaveAttribute('aria-pressed', 'false')
    expect(unliked).toHaveTextContent('0 likes')
  })

  it('cannot be clicked until the server state has loaded', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ signedIn: true, likes: { '11': { count: 1, liked: true } } }),
    )
    render(<TweetLikeButton tweetId="11" xLikeCount={10} />)

    expect(screen.getByRole('button')).toBeDisabled()
    await hydrate()
    expect(screen.getByRole('button')).toBeEnabled()
    expect(screen.getByRole('button')).toHaveAccessibleName(
      'Unlike on Community Archive, 11 likes',
    )
  })

  it('likes optimistically and reports the action', async () => {
    fetchMock.mockResolvedValueOnce(json({ signedIn: true, likes: {} }))
    const onToggle = jest.fn()
    render(<TweetLikeButton tweetId="11" xLikeCount={10} onToggle={onToggle} />)
    await hydrate()

    fetchMock.mockResolvedValueOnce(json({ liked: true, count: 1 }))
    fireEvent.click(screen.getByRole('button'))
    // A second click while the write is in flight must not send an unlike.
    fireEvent.click(screen.getByRole('button'))

    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(onToggle).toHaveBeenCalledWith('like'))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenLastCalledWith('/api/tweets/11/like', {
      method: 'POST',
    })
    expect(screen.getByRole('button')).toHaveTextContent('11 likes')
  })

  it('keeps the optimistic count when the server cannot recount', async () => {
    fetchMock.mockResolvedValueOnce(json({ signedIn: true, likes: {} }))
    const onToggle = jest.fn()
    render(<TweetLikeButton tweetId="11" xLikeCount={10} onToggle={onToggle} />)
    await hydrate()

    fetchMock.mockResolvedValueOnce(json({ liked: true, count: null }))
    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => expect(onToggle).toHaveBeenCalledWith('like'))
    expect(screen.getByRole('button')).toHaveTextContent('11 likes')
  })

  it('reverts the optimistic like when the write fails', async () => {
    fetchMock.mockResolvedValueOnce(json({ signedIn: true, likes: {} }))
    const onToggle = jest.fn()
    const consoleError = jest.spyOn(console, 'error').mockImplementation()
    render(<TweetLikeButton tweetId="11" xLikeCount={10} onToggle={onToggle} />)
    await hydrate()

    fetchMock.mockResolvedValueOnce(json({ error: 'nope' }, 500))
    fireEvent.click(screen.getByRole('button'))

    await waitFor(() =>
      expect(screen.getByRole('button')).toHaveAttribute(
        'aria-pressed',
        'false',
      ),
    )
    expect(onToggle).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
