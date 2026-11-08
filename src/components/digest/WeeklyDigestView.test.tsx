/** @jest-environment jsdom */

import React from 'react'
import '@testing-library/jest-dom'
import { readFileSync } from 'fs'
import { join } from 'path'
import { fireEvent, render, screen } from '@testing-library/react'
import { WeeklyDigestView, WeeklyStoryView } from './WeeklyDigestView'
import { dailyPreviewKey, type WeeklyDigestContent } from '@/lib/digest/weekly'
import type { WeeklyDigestEdition } from '@/lib/digest/weeklyData'
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
jest.mock('@/components/digest/WeeklyText', () => ({
  WeeklyText: ({ children }: { children: string }) => <>{children}</>,
  WeeklyPeopleProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}))
jest.mock('@/components/digest/WeeklyConversationMap', () => ({
  WeeklyConversationMap: ({ label }: { label: string }) => (
    <div data-testid="weekly-map">{label}</div>
  ),
}))
jest.mock('@/components/digest/DigestSubscribeButton', () => ({
  DigestSubscribeButton: () => null,
}))

const content = JSON.parse(
  readFileSync(
    join(
      process.cwd(),
      'memos/artifacts/20261108-weekly-digest-v2/2026-10-26.json',
    ),
    'utf8',
  ),
) as WeeklyDigestContent
const edition: WeeklyDigestEdition = {
  id: 'week',
  weekStart: content.weekStart,
  publishedAt: null,
  content,
}

describe('WeeklyDigestView', () => {
  test('lists every story as a table of contents linking to its own page', () => {
    render(<WeeklyDigestView edition={edition} weeks={[content.weekStart]} />)
    const contents = screen.getByRole('heading', { name: 'In this issue' })
      .parentElement as HTMLElement
    const readLinks = Array.from(contents.querySelectorAll('a')).filter(
      (link) => link.textContent === 'Read the story →',
    )
    expect(readLinks.map((link) => link.getAttribute('href'))).toEqual(
      content.stories.map(
        (story) => `/digest/week/${content.weekStart}/${story.slug}`,
      ),
    )
    expect(screen.queryAllByTestId('tweet-card')).toHaveLength(0)
    expect(screen.getByTestId('weekly-map')).toBeInTheDocument()
  })

  test('previews the referenced daily story on keyboard focus', async () => {
    const story = content.stories[0]
    const ref = story.dailyStories[0]
    render(
      <WeeklyDigestView
        edition={edition}
        weeks={[content.weekStart]}
        previews={{
          [dailyPreviewKey(ref.digestDate, ref.slug)]: {
            kicker: 'Daily digest · Tuesday 27 October',
            title: 'Preview title',
            excerpt: 'Preview excerpt from the daily section',
          },
        }}
      />,
    )
    const link = document.querySelector(
      `a[href="/digest/${ref.digestDate}/${ref.slug}"]`,
    ) as HTMLElement
    fireEvent.focus(link)
    expect(
      (await screen.findAllByText('Preview excerpt from the daily section'))
        .length,
    ).toBeGreaterThan(0)
  })

  test('renders one story page with its coverage, tweets and neighbours', () => {
    const story = content.stories[1]
    render(<WeeklyStoryView edition={edition} story={story} />)
    expect(
      screen.getByText(`Story 2 of ${content.stories.length}`),
    ).toBeInTheDocument()
    for (const ref of story.dailyStories) {
      expect(
        document.querySelector(
          `a[href="/digest/${ref.digestDate}/${ref.slug}"]`,
        ),
      ).not.toBeNull()
    }
    // Every banger appears once: in a commentary segment or in "More".
    expect(
      screen.queryAllByTestId('tweet-card').map((card) => card.textContent),
    ).toEqual(expect.arrayContaining(story.tweets.map(({ id }) => id)))
    expect(screen.queryAllByTestId('tweet-card')).toHaveLength(
      story.tweets.length,
    )
    for (const segment of story.segments) {
      expect(screen.getByText(segment.commentary)).toBeInTheDocument()
    }
    expect(screen.getByText('← Previous story')).toBeInTheDocument()
  })
})
