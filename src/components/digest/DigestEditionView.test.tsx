/** @jest-environment jsdom */

import React from 'react'
import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import { DigestEditionView } from './DigestEditionView'
import { AUGUST_11_MOCK_DIGEST } from '@/lib/digest/mock'
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
  default: () => <div data-testid="tweet-card" />,
}))

jest.mock('@/components/digest/DigestDaySelector', () => ({
  DigestDaySelector: () => <div data-testid="day-selector" />,
}))

jest.mock('@/components/digest/DigestMarkdown', () => ({
  DigestMarkdown: ({ children }: { children: string }) => <>{children}</>,
}))

describe('DigestEditionView', () => {
  test('shows a standalone representative tweet but omits one already in a story', async () => {
    const content = AUGUST_11_MOCK_DIGEST.content
    const standalone = {
      ...AUGUST_11_MOCK_DIGEST,
      content: {
        ...content,
        topBanger: { ...content.topBanger, id: 'standalone' },
      },
    }
    const { rerender } = render(
      <DigestEditionView edition={standalone} archive={[standalone]} />,
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Subscribe' })).toBeEnabled(),
    )
    expect(screen.getByText('Representative tweet')).toBeVisible()
    const cardCount = screen.getAllByTestId('tweet-card').length
    const repeated = {
      ...standalone,
      content: { ...content, topBanger: content.stories[0].bangers[0] },
    }
    rerender(<DigestEditionView edition={repeated} archive={[repeated]} />)
    expect(screen.queryByText('Representative tweet')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('tweet-card')).toHaveLength(cardCount - 1)
  })

  test('offers the inline email subscribe control', async () => {
    render(
      <DigestEditionView
        edition={AUGUST_11_MOCK_DIGEST}
        archive={[AUGUST_11_MOCK_DIGEST]}
      />,
    )

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Subscribe' })).toBeEnabled(),
    )
    expect(
      screen.queryByRole('link', {
        name: 'Subscribe to Community Archive on Substack',
      }),
    ).not.toBeInTheDocument()
  })

  test('shows the editorial lab shortcut only to admins', async () => {
    const { rerender } = render(
      <DigestEditionView
        edition={AUGUST_11_MOCK_DIGEST}
        archive={[AUGUST_11_MOCK_DIGEST]}
        isAdmin
      />,
    )

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Subscribe' })).toBeEnabled(),
    )
    expect(
      screen.getByRole('link', { name: 'Editorial lab →' }),
    ).toHaveAttribute('href', '/admin/digest')

    rerender(
      <DigestEditionView
        edition={AUGUST_11_MOCK_DIGEST}
        archive={[AUGUST_11_MOCK_DIGEST]}
      />,
    )

    expect(
      screen.queryByRole('link', { name: 'Editorial lab →' }),
    ).not.toBeInTheDocument()
  })
})
