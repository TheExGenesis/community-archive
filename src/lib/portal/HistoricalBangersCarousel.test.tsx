/** @jest-environment jsdom */

import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { HistoricalBangersCarousel } from '@/components/portal/HistoricalBangersCarousel'
import type { PortalTweet } from '@/lib/portal/types'
;(globalThis as typeof globalThis & { React: typeof React }).React = React

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

const tweet = (id: string): PortalTweet => ({
  id,
  username: `member_${id}`,
  name: `Member ${id}`,
  avatar: null,
  text: `Historical banger ${id}`,
  observedAt: '2026-08-07T20:00:00.000Z',
  createdAt: `2024-08-0${id}T19:00:00.000Z`,
  likes: Number(id),
  rts: 0,
})

describe('HistoricalBangersCarousel', () => {
  test('cycles through historical bangers and links to the full page', () => {
    render(
      <HistoricalBangersCarousel
        tweets={[tweet('1'), tweet('2'), tweet('3')]}
      />,
    )

    expect(
      screen.getByRole('link', { name: 'More bangers →' }),
    ).toHaveAttribute('href', '/bangers')
    expect(screen.getByText('Historical banger 1')).toBeVisible()
    expect(screen.getByText('1 of 3')).toBeVisible()

    fireEvent.click(
      screen.getByRole('button', { name: 'Next historical banger' }),
    )
    expect(screen.queryByText('Historical banger 1')).not.toBeInTheDocument()
    expect(screen.getByText('Historical banger 2')).toBeVisible()
    expect(screen.getByText('2 of 3')).toBeVisible()

    fireEvent.click(
      screen.getByRole('button', { name: 'Previous historical banger' }),
    )
    expect(screen.getByText('Historical banger 1')).toBeVisible()

    fireEvent.click(
      screen.getByRole('button', { name: 'Previous historical banger' }),
    )
    expect(screen.getByText('Historical banger 3')).toBeVisible()
    expect(screen.getByText('3 of 3')).toBeVisible()
  })

  test('supports arrow keys when the carousel itself is focused', () => {
    render(<HistoricalBangersCarousel tweets={[tweet('1'), tweet('2')]} />)

    const carousel = screen.getByRole('region', {
      name: 'Historical bangers',
    })
    carousel.focus()
    fireEvent.keyDown(carousel, { key: 'ArrowRight' })

    expect(screen.getByText('Historical banger 2')).toBeVisible()
  })

  test('pins overlay controls around a fixed-height, scrollable tweet viewport', () => {
    render(<HistoricalBangersCarousel tweets={[tweet('1'), tweet('2')]} />)

    const carousel = screen.getByRole('region', {
      name: 'Historical bangers',
    })
    const tweetArticle = screen
      .getByText('Historical banger 1')
      .closest('article')
    const previous = screen.getByRole('button', {
      name: 'Previous historical banger',
    })
    const next = screen.getByRole('button', {
      name: 'Next historical banger',
    })

    expect(carousel).toHaveClass('relative', 'flex', 'h-[22rem]')
    expect(tweetArticle?.parentElement).toHaveClass('h-full', 'overflow-y-auto')
    expect(previous).toHaveClass('absolute', 'left-3', 'top-1/2')
    expect(next).toHaveClass('absolute', 'right-3', 'top-1/2')
  })
})
