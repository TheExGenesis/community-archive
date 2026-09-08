import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import AvatarList from './AvatarList'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: jest.fn() }),
}))

const archive = { account_id: '42', username: 'alice', avatar_media_url: '' }
const pendingImages: HTMLImageElement[] = []
const recovered = 'https://pbs.twimg.com/recovered_normal.jpg'

beforeEach(() => {
  pendingImages.length = 0
  // Exercise real Radix preload behavior: failed images never mount in the DOM.
  jest.spyOn(window, 'Image').mockImplementation(() => {
    const image = document.createElement('img')
    pendingImages.push(image)
    return image
  })
})
afterEach(() => jest.restoreAllMocks())

it('recovers a missing homepage avatar through the bounded profile route', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValueOnce({
    ok: true,
    json: async () => ({ avatar_media_url: recovered }),
  } as Response)
  render(<AvatarList initialAvatars={[archive]} compact />)
  expect(screen.getByText('A')).toBeInTheDocument()
  await waitFor(() => expect(pendingImages).toHaveLength(1))
  fireEvent.load(pendingImages[0])
  expect(screen.getByAltText("alice's avatar")).toHaveAttribute(
    'src',
    recovered,
  )
  expect(global.fetch).toHaveBeenCalledWith('/api/profile/42/avatar')
})

it('uses the current stored profile photo when a homepage snapshot image fails', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValueOnce({
    ok: true,
    json: async () => ({ avatar_media_url: recovered }),
  } as Response)
  render(
    <AvatarList
      initialAvatars={[
        {
          ...archive,
          avatar_media_url: 'https://pbs.twimg.com/old_normal.jpg',
        },
      ]}
    />,
  )
  fireEvent.error(pendingImages[0])
  await waitFor(() => expect(pendingImages).toHaveLength(2))
  fireEvent.load(pendingImages[1])
  expect(screen.getByAltText("alice's avatar")).toHaveAttribute(
    'src',
    recovered,
  )
  expect(global.fetch).toHaveBeenCalledTimes(1)
  expect(global.fetch).toHaveBeenCalledWith('/api/profile/42/avatar')
})

it('tries a fresh lookup only if the stored photo also fails, then stops', async () => {
  const broken = 'https://pbs.twimg.com/broken_normal.jpg'
  jest
    .spyOn(global, 'fetch')
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ avatar_media_url: broken }),
    } as Response)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ avatar_media_url: recovered }),
    } as Response)
  render(
    <AvatarList initialAvatars={[{ ...archive, avatar_media_url: broken }]} />,
  )
  fireEvent.error(pendingImages[0])
  await waitFor(() => expect(pendingImages).toHaveLength(2))
  fireEvent.error(pendingImages[1])
  await waitFor(() => expect(pendingImages).toHaveLength(3))
  expect(global.fetch).toHaveBeenNthCalledWith(1, '/api/profile/42/avatar')
  expect(global.fetch).toHaveBeenNthCalledWith(
    2,
    '/api/profile/42/avatar?refresh=1',
  )
  fireEvent.error(pendingImages[2])
  expect(screen.getByText('A')).toBeInTheDocument()
  expect(global.fetch).toHaveBeenCalledTimes(2)
})

it('does not apply an old recovery response after the avatar input changes', async () => {
  let resolve!: (response: Response) => void
  jest.spyOn(global, 'fetch').mockReturnValueOnce(
    new Promise((r) => {
      resolve = r
    }),
  )
  const { rerender } = render(<AvatarList initialAvatars={[archive]} />)
  const newUrl = 'https://pbs.twimg.com/current_normal.jpg'
  rerender(
    <AvatarList initialAvatars={[{ ...archive, avatar_media_url: newUrl }]} />,
  )
  await act(async () =>
    resolve({
      ok: true,
      json: async () => ({ avatar_media_url: recovered }),
    } as Response),
  )
  expect(pendingImages).toHaveLength(1)
  fireEvent.load(pendingImages[0])
  expect(screen.getByAltText("alice's avatar")).toHaveAttribute('src', newUrl)
})

it('keeps Unicode initials intact when no photo is available', () => {
  jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as Response)
  render(<AvatarList initialAvatars={[{ ...archive, username: '🌻alice' }]} />)
  expect(screen.getByText('🌻')).toBeInTheDocument()
})

it('shows archived tweet count instead of follower count', () => {
  render(
    <AvatarList
      initialAvatars={[
        {
          ...archive,
          avatar_media_url: recovered,
          num_tweets: 12_345,
          num_followers: 98_765,
        },
      ]}
      compact
    />,
  )
  expect(screen.getByText('12.3K tweets')).toBeInTheDocument()
  expect(screen.queryByText(/followers/)).not.toBeInTheDocument()
})
