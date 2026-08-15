/** @jest-environment jsdom */

import React from 'react'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
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
  test('uses the What Happened Yesterday public title', () => {
    render(
      <DigestEditionView
        edition={AUGUST_11_MOCK_DIGEST}
        archive={[AUGUST_11_MOCK_DIGEST]}
      />,
    )

    expect(screen.getByText('What Happened Yesterday')).toBeVisible()
    expect(screen.queryByText('The Daily Digest')).not.toBeInTheDocument()
  })

  test('keeps the future weekly newsletter call to action hidden', () => {
    render(
      <DigestEditionView
        edition={AUGUST_11_MOCK_DIGEST}
        archive={[AUGUST_11_MOCK_DIGEST]}
      />,
    )

    expect(
      screen.queryByRole('link', { name: 'Get the weekly email' }),
    ).not.toBeInTheDocument()
  })

  test('shows the editorial lab shortcut only to admins', () => {
    const { rerender } = render(
      <DigestEditionView
        edition={AUGUST_11_MOCK_DIGEST}
        archive={[AUGUST_11_MOCK_DIGEST]}
        isAdmin
      />,
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
