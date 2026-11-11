/** @jest-environment jsdom */

import React from 'react'
import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import { CurrentWeekView } from './CurrentWeekView'
import { AUGUST_11_MOCK_DIGEST } from '@/lib/digest/mock'
import { weekDates } from '@/lib/digest/weekly'
import type { DigestEdition } from '@/lib/digest/types'
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
jest.mock('@/components/TweetCard', () => ({
  __esModule: true,
  default: ({ tweet }: { tweet: PortalTweet }) => (
    <div data-testid="tweet-card">{tweet.id}</div>
  ),
}))
jest.mock('@/components/digest/DigestMarkdown', () => ({
  DigestMarkdown: ({ children }: { children: string }) => <>{children}</>,
}))
jest.mock('@/components/digest/DigestSubscribeButton', () => ({
  DigestSubscribeButton: () => null,
}))
jest.mock('@/components/digest/WeeklyDigestView', () => ({
  weekRangeLabel: (start: string, end: string) => `${start} to ${end}`,
}))

const dates = weekDates('2026-11-09')
const editionOn = (digestDate: string): DigestEdition => ({
  ...AUGUST_11_MOCK_DIGEST,
  id: digestDate,
  digestDate,
  isPreview: false,
})
const week = {
  weekStart: dates[0],
  dates,
  editions: [editionOn(dates[0]), editionOn(dates[1])],
}
const stories = AUGUST_11_MOCK_DIGEST.content.stories

describe('CurrentWeekView', () => {
  test('lists each published day, newest first, with links to its stories', () => {
    render(<CurrentWeekView week={week} previousWeek="2026-11-02" />)
    expect(
      screen.getAllByRole('region').map((day) => day.getAttribute('id')),
    ).toEqual([dates[1], dates[0]])
    const tuesday = screen.getByRole('region', { name: 'Tuesday 10 November' })
    expect(
      within(tuesday)
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.querySelector('a')?.getAttribute('href')),
    ).toEqual(stories.map((story) => `/digest/${dates[1]}/${story.slug}`))
    // Only the day's lead story shows tweets.
    expect(
      within(tuesday)
        .getAllByTestId('tweet-card')
        .map((card) => card.textContent),
    ).toEqual(stories[0].bangers.slice(0, 2).map((tweet) => tweet.id))
    expect(
      screen.getByRole('link', { name: '← Previous week' }),
    ).toHaveAttribute('href', '/digest/week/2026-11-02')
  })

  test('marks the days that have no edition yet', () => {
    render(<CurrentWeekView week={week} />)
    const days = within(screen.getByRole('list', { name: 'Days this week' }))
    expect(days.getByRole('link', { name: 'Mon 9' })).toHaveAttribute(
      'href',
      `#${dates[0]}`,
    )
    expect(days.queryByRole('link', { name: 'Sun 15' })).toBeNull()
    expect(days.getByLabelText('Sun 15, no edition yet')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '← Previous week' })).toBeNull()
  })
})
