import { render, screen, waitFor } from '@testing-library/react'
import { ProfileAvatar } from './ProfileAvatar'

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt = '', ...props }: { alt?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}))

afterEach(() => {
  jest.restoreAllMocks()
})

test('keeps a stored avatar without requesting syndication recovery', () => {
  const fetchMock = jest.spyOn(global, 'fetch')
  render(
    <ProfileAvatar
      accountId="42"
      avatarUrl="https://pbs.twimg.com/stored.jpg"
      displayName="Alice"
    />,
  )

  expect(screen.getByAltText("Alice's avatar")).toHaveAttribute(
    'src',
    'https://pbs.twimg.com/stored.jpg',
  )
  expect(fetchMock).not.toHaveBeenCalled()
})

test('recovers a missing avatar after rendering the initial fallback', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      avatar_media_url: 'https://pbs.twimg.com/recovered_400x400.jpg',
    }),
  } as Response)

  render(<ProfileAvatar accountId="42" avatarUrl={null} displayName="Alice" />)

  expect(screen.getByText('A')).toBeVisible()
  await waitFor(() =>
    expect(screen.getByAltText("Alice's avatar")).toHaveAttribute(
      'src',
      'https://pbs.twimg.com/recovered_400x400.jpg',
    ),
  )
  expect(global.fetch).toHaveBeenCalledWith('/api/profile/42/avatar')
})
