import type { ImgHTMLAttributes, ReactNode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProfileMediaGallery } from './ProfileMediaGallery'
import type { ArchiveMediaItem } from '@/lib/metaTwitter/types'

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({
    alt = '',
    fill: _fill,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}))

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  ),
  DialogDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  DialogHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}))

const mediaItem = (index: number): ArchiveMediaItem => ({
  tweet_id: String(100 + index),
  created_at: '2026-08-01T00:00:00.000Z',
  favorite_count: 10,
  media_url: `https://pbs.twimg.com/media/${index}.jpg`,
  media_type: 'photo',
  width: 1200,
  height: 800,
})

afterEach(() => {
  jest.restoreAllMocks()
})

test('loads bounded gallery pages until every profile photo is reachable', async () => {
  const user = userEvent.setup()
  const initialMedia = Array.from({ length: 6 }, (_, index) => mediaItem(index))
  const secondPage = Array.from({ length: 24 }, (_, index) =>
    mediaItem(index + 6),
  )
  const fetchMock = jest
    .spyOn(global, 'fetch')
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          media: secondPage,
          mediaCount: 31,
          nextOffset: 30,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          media: [mediaItem(30)],
          mediaCount: 31,
          nextOffset: null,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )

  render(
    <ProfileMediaGallery
      accountId="42"
      initialMedia={initialMedia}
      mediaCount={31}
      onOpenChange={jest.fn()}
      returnTo="/user/alice"
      year={2026}
    />,
  )

  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/profile/42/media?limit=24&offset=6&year=2026',
    ),
  )
  expect(
    await screen.findByText(
      'Showing 30 of 31 archived photos. Open one to view its post.',
    ),
  ).toBeVisible()

  await user.click(screen.getByRole('button', { name: 'Load 1 more photos' }))
  await waitFor(() =>
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/profile/42/media?limit=24&offset=30&year=2026',
    ),
  )
  expect(
    await screen.findByText(
      'Showing 31 of 31 archived photos. Open one to view its post.',
    ),
  ).toBeVisible()
  expect(
    screen.queryByRole('button', { name: /more photos/i }),
  ).not.toBeInTheDocument()
  expect(screen.getAllByAltText('Archived post media')).toHaveLength(31)
})
