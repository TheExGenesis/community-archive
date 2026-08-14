/** @jest-environment jsdom */

import React from 'react'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { DigestDaySelector } from './DigestDaySelector'
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

describe('DigestDaySelector', () => {
  test('makes August 11 clickable while leaving dates without editions disabled', () => {
    render(
      <DigestDaySelector
        currentDate="2026-08-11"
        editions={[AUGUST_11_MOCK_DIGEST]}
      />,
    )

    expect(screen.getByText('August 2026')).toBeVisible()
    expect(
      screen.getByRole('link', {
        name: '2026-08-11, preview edition',
      }),
    ).toHaveAttribute('href', '/digest/2026-08-11')
    expect(screen.getByText('10').closest('a')).toBeNull()
  })
})
