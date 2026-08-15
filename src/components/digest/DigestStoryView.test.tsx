/** @jest-environment jsdom */

import React from 'react'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { DigestStoryView } from './DigestStoryView'
import { AUGUST_11_MOCK_DIGEST } from '@/lib/digest/mock'
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
    <div data-testid="tweet-card">{tweet.text}</div>
  ),
}))

jest.mock('@/components/digest/DigestMarkdown', () => ({
  DigestMarkdown: ({ children }: { children: string }) => <>{children}</>,
}))

describe('DigestStoryView', () => {
  test('shows archived quote posts that were not selected as commentary', () => {
    const story = AUGUST_11_MOCK_DIGEST.content.stories[0]
    const quotePost: PortalTweet = {
      ...story.bangers[0],
      id: 'quote-post-1',
      username: 'quote_author',
      name: 'Quote Author',
      text: 'This quote belongs on the story page',
    }

    render(
      <DigestStoryView
        edition={AUGUST_11_MOCK_DIGEST}
        story={story}
        quotePosts={[
          {
            bangerId: story.bangers[0].id,
            tweets: [quotePost],
            totalCount: 1,
          },
        ]}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Archived quote posts' }),
    ).toBeVisible()
    const headings = screen
      .getAllByRole('heading')
      .map((heading) => heading.textContent)
    expect(headings.indexOf('Surrounding conversation')).toBeLessThan(
      headings.indexOf('Archived quote posts'),
    )
    expect(
      screen.getByText('This quote belongs on the story page'),
    ).toBeVisible()
    expect(
      screen.getByText(`Quotes of @${story.bangers[0].username}`),
    ).toBeVisible()
  })
})
