import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import AvatarList from './AvatarList'

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AvatarImage: ({
    alt = '',
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
  AvatarFallback: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}))

const archive = {
  account_id: '42',
  username: 'alice',
  avatar_media_url: '',
}

afterEach(() => {
  jest.restoreAllMocks()
})

it('recovers a missing homepage avatar through the bounded profile route', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      avatar_media_url: 'https://pbs.twimg.com/recovered_normal.jpg',
    }),
  } as Response)

  render(<AvatarList initialAvatars={[archive]} compact />)

  expect(screen.getByText('A')).toBeInTheDocument()
  await waitFor(() =>
    expect(screen.getByAltText("alice's avatar")).toHaveAttribute(
      'src',
      'https://pbs.twimg.com/recovered_normal.jpg',
    ),
  )
  expect(global.fetch).toHaveBeenCalledWith('/api/profile/42/avatar')
})

it('tries recovery once when a stored avatar fails to load', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      avatar_media_url: 'https://pbs.twimg.com/recovered_normal.jpg',
    }),
  } as Response)

  render(
    <AvatarList
      initialAvatars={[
        {
          ...archive,
          avatar_media_url: 'https://pbs.twimg.com/broken_normal.jpg',
        },
      ]}
      compact
    />,
  )

  fireEvent.error(screen.getByAltText("alice's avatar"))

  await waitFor(() =>
    expect(screen.getByAltText("alice's avatar")).toHaveAttribute(
      'src',
      'https://pbs.twimg.com/recovered_normal.jpg',
    ),
  )
  expect(global.fetch).toHaveBeenCalledTimes(1)
})
