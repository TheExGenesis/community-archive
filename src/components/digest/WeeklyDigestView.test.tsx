/** @jest-environment jsdom */

import React from 'react'
import '@testing-library/jest-dom'
import { readFileSync } from 'fs'
import { join } from 'path'
import { fireEvent, render, screen } from '@testing-library/react'
import {
  moreFromLastWeek,
  WeeklyDigestView,
  WeeklyStoryView,
} from './WeeklyDigestView'
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
jest.mock('@/components/digest/DigestSubscribeButton', () => ({
  DigestSubscribeButton: () => null,
}))

const fixture = (weekStart: string) =>
  JSON.parse(
    readFileSync(
      join(
        process.cwd(),
        `memos/artifacts/20261108-weekly-digest-v7/${weekStart}.json`,
      ),
      'utf8',
    ),
  ) as WeeklyDigestContent
const content = fixture('2026-10-26')
const lastWeekContent = fixture('2026-10-19')
const lastWeek: WeeklyDigestEdition = {
  id: 'last-week',
  weekStart: lastWeekContent.weekStart,
  publishedAt: null,
  content: lastWeekContent,
}
const edition: WeeklyDigestEdition = {
  id: 'week',
  weekStart: content.weekStart,
  publishedAt: null,
  content,
}

describe('WeeklyDigestView', () => {
  test('opens with the stories, each linking to its own page', () => {
    render(<WeeklyDigestView edition={edition} weeks={[content.weekStart]} />)
    const contents = screen.getByRole('region', {
      name: "This week's stories",
    })
    const readLinks = Array.from(contents.querySelectorAll('a')).filter(
      (link) => link.textContent === 'Read the story →',
    )
    expect(readLinks.map((link) => link.getAttribute('href'))).toEqual(
      content.stories.map(
        (story) => `/digest/week/${content.weekStart}/${story.slug}`,
      ),
    )
    expect(
      screen.queryAllByTestId('tweet-card').map((card) => card.textContent),
    ).toEqual(content.stories.flatMap((story) => story.featuredTweetIds))
    expect(
      screen.getByRole('link', {
        name: `\u201c${content.stories[0].title}\u201d`,
      }),
    ).toBeInTheDocument()
    expect(screen.getByText(content.dek)).toBeInTheDocument()
    expect(screen.queryByText(content.executiveSummary[0])).toBeNull()
    expect(screen.getByText('Trending words')).toBeInTheDocument()
    expect(screen.getByText('Keywords this week')).toBeInTheDocument()
  })

  test('renders the bulletin and discussion it is given under the stories', () => {
    render(
      <WeeklyDigestView
        edition={edition}
        weeks={[content.weekStart]}
        bulletin={<section>Bulletin picks</section>}
        comments={<section>Discussion</section>}
      />,
    )
    expect(screen.getByText('Bulletin picks')).toBeInTheDocument()
    expect(screen.getByText('Discussion')).toBeInTheDocument()
  })

  test('previews the referenced daily story on keyboard focus', async () => {
    const story = content.stories[0]
    const ref = story.dailyStories[0]
    render(
      <WeeklyStoryView
        edition={edition}
        story={story}
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
  describe('week so far', () => {
    const soFarEdition: WeeklyDigestEdition = {
      ...edition,
      content: { ...content, throughDate: '2026-10-28' },
    }
    const continued = content.stories.flatMap((story) => story.continuesFrom)
    const continuedLastWeek = continued.filter(
      (ref) => ref.weekStart === lastWeek.weekStart,
    )

    test("lists last week's stories that no story this week continues", () => {
      // The fixture week continues exactly one of last week's stories.
      expect(continuedLastWeek).toHaveLength(1)
      render(
        <WeeklyDigestView
          edition={soFarEdition}
          weeks={[lastWeek.weekStart]}
          soFar={{ lastWeek }}
        />,
      )
      const section = screen
        .getByRole('heading', { name: 'More from last week' })
        .closest('section') as HTMLElement
      const open = lastWeekContent.stories.filter(
        (story) => story.slug !== continuedLastWeek[0].slug,
      )
      const links = Array.from(section.querySelectorAll('a'))
      expect(links.map((link) => link.getAttribute('href'))).toEqual([
        ...open.map(
          (story) => `/digest/week/${lastWeek.weekStart}/${story.slug}`,
        ),
        `/digest/week/${lastWeek.weekStart}`,
      ])
      expect(links[0]).toHaveTextContent(open[0].subtitle.replace(/[*_`]/g, ''))
      expect(links.at(-1)).toHaveTextContent(
        "Read last week's Week in Review →",
      )
      expect(screen.queryByText('Last week in review')).toBeNull()
    })

    test('is only the heading and the link when every story continues', () => {
      const allContinued: WeeklyDigestContent = {
        ...soFarEdition.content,
        stories: soFarEdition.content.stories.map((story, index) => ({
          ...story,
          continuesFrom:
            index === 0
              ? lastWeekContent.stories.map((item) => ({
                  weekStart: lastWeek.weekStart,
                  slug: item.slug,
                  title: item.title,
                }))
              : story.continuesFrom,
        })),
      }
      expect(moreFromLastWeek(lastWeek, allContinued)).toEqual([])
      render(
        <WeeklyDigestView
          edition={{ ...soFarEdition, content: allContinued }}
          weeks={[lastWeek.weekStart]}
          soFar={{ lastWeek }}
        />,
      )
      const section = screen
        .getByRole('heading', { name: 'More from last week' })
        .closest('section') as HTMLElement
      expect(
        Array.from(section.querySelectorAll('a')).map((link) =>
          link.getAttribute('href'),
        ),
      ).toEqual([`/digest/week/${lastWeek.weekStart}`])
    })

    test('a final edition has no "More from last week"', () => {
      render(<WeeklyDigestView edition={edition} weeks={[content.weekStart]} />)
      expect(screen.queryByText('More from last week')).toBeNull()
    })
  })

  test('links an also-notable entry to the earlier week it continues', () => {
    const ref = {
      weekStart: lastWeek.weekStart,
      slug: lastWeekContent.stories[2].slug,
      title: lastWeekContent.stories[2].title,
    }
    const withContinuation: WeeklyDigestContent = {
      ...content,
      alsoNotable: content.alsoNotable.map((item, index) =>
        index === 0 ? { ...item, continuesFrom: [ref] } : item,
      ),
    }
    render(
      <WeeklyDigestView
        edition={{ ...edition, content: withContinuation }}
        weeks={[content.weekStart]}
      />,
    )
    const also = screen
      .getByRole('heading', { name: 'Also this week' })
      .closest('section') as HTMLElement
    const entries = also.querySelectorAll('li')
    expect(entries[0]).toHaveTextContent(
      'Continues from the week of 19 October',
    )
    expect(
      entries[0].querySelector(
        `a[href="/digest/week/${ref.weekStart}/${ref.slug}"]`,
      ),
    ).not.toBeNull()
    // Entries without the field (every entry of older editions) are unchanged.
    expect(entries[1]).not.toHaveTextContent('Continues from')
  })
})
