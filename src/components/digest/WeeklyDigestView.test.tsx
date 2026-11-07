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
jest.mock('@/components/digest/DigestMarkdown', () => ({
  DigestMarkdown: ({ children }: { children: string }) => <>{children}</>,
}))
jest.mock('@/components/digest/DigestSubscribeButton', () => ({
  DigestSubscribeButton: () => null,
}))

const content = JSON.parse(
  readFileSync(
    join(
      process.cwd(),
      'memos/artifacts/20261106-weekly-digest/2026-10-26.json',
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
    expect(screen.queryAllByTestId('tweet-card')).toHaveLength(
      story.tweets.length,
    )
    expect(screen.getByText('← Previous story')).toBeInTheDocument()
  })
})
