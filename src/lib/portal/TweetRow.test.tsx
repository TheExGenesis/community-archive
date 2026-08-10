/** @jest-environment jsdom */

import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TweetRow } from '@/components/portal/TweetRow'
import type { PortalTweet } from '@/lib/portal/types'
;(globalThis as typeof globalThis & { React: typeof React }).React = React

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({
    src,
    alt,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={String(src)} alt={alt} {...props} />
  ),
}))

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}))

const tweet: PortalTweet = {
  id: '42',
  username: 'archive_member',
  name: 'Archive Member',
  avatar: null,
  text: 'A quote with a picture',
  observedAt: '2026-08-07T20:00:00.000Z',
  createdAt: '2026-08-07T19:00:00.000Z',
  likes: 3,
  rts: 2,
  quoteCount: 12,
  media: [
    {
      url: 'https://pbs.twimg.com/media/main.jpg',
      type: 'photo',
      width: 1200,
      height: 800,
    },
  ],
  quotedTweet: {
    id: '99',
    username: 'quoted_member',
    name: 'Quoted Member',
    avatar: null,
    text: 'The quoted thought',
    createdAt: '2026-08-06T19:00:00.000Z',
    likes: 12,
    rts: 4,
    media: [
      {
        url: 'https://pbs.twimg.com/media/quoted.jpg',
        type: 'photo',
      },
    ],
  },
}

describe('portal TweetRow media', () => {
  test('highlights a top banger without showing a corner rank badge', () => {
    render(<TweetRow tweet={tweet} featuredRank={1} />)

    expect(screen.queryByLabelText('Rank 1')).not.toBeInTheDocument()
    expect(screen.getByRole('article')).toHaveClass('from-amber-50/80')
    expect(screen.getByText(/12 archive quotes/)).toHaveClass('rounded-full')
  })

  test('renders quotes and closes an enlarged image when the backdrop is clicked', async () => {
    render(<TweetRow tweet={tweet} />)

    expect(screen.getByText('The quoted thought')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Enlarge tweet image 1' }),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Enlarge quoted tweet image 1' }),
    ).toBeVisible()

    fireEvent.click(
      screen.getByRole('button', { name: 'Enlarge tweet image 1' }),
    )
    expect(screen.getByRole('dialog')).toBeVisible()

    const overlay = document.querySelector<HTMLElement>(
      '[data-state="open"].fixed.inset-0',
    )
    expect(overlay).not.toBeNull()
    await new Promise((resolve) => setTimeout(resolve, 0))
    fireEvent.pointerDown(overlay!, { button: 0, pointerType: 'mouse' })
    fireEvent.click(overlay!)

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
  })
})
