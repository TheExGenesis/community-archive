/** @jest-environment jsdom */

import React from 'react'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  test('makes every supplied public digest day clickable', () => {
    const august12 = {
      ...AUGUST_11_MOCK_DIGEST,
      id: 'published-august-12',
      digestDate: '2026-08-12',
      isPreview: false,
    }

    render(
      <DigestDaySelector
        currentDate="2026-08-12"
        editions={[AUGUST_11_MOCK_DIGEST, august12]}
        variant="editorial"
      />,
    )

    expect(
      screen.getByRole('link', { name: '2026-08-11, preview edition' }),
    ).toHaveAttribute('href', '/digest/2026-08-11')
    expect(screen.getByRole('link', { name: '2026-08-12' })).toHaveAttribute(
      'href',
      '/digest/2026-08-12',
    )
  })

  test('turns configured past days into generation buttons and changes months in place', async () => {
    const user = userEvent.setup()
    render(
      <DigestDaySelector
        currentDate="2026-08-13"
        editions={[]}
        variant="editorial"
        generation={{
          action: '/admin/digest',
          dates: ['2026-07-11', '2026-08-11', '2026-08-12', '2026-08-13'],
          promptVersionId: 'prompt-1',
          runningRuns: [{ date: '2026-08-12', id: 'run-12' }],
        }}
      />,
    )

    const august11 = screen.getByRole('button', {
      name: 'Generate digest for 2026-08-11',
    })
    expect(august11).toBeVisible()
    expect(august11.closest('form')).toHaveFormValues({
      prompt_version_id: 'prompt-1',
      digest_date: '2026-08-11',
      target_ca_users_only: 'true',
    })
    const authorshipToggle = screen.getByRole('checkbox', {
      name: 'Only include posts authored by Community Archive members',
    })
    await user.click(authorshipToggle)
    expect(august11.closest('form')).toHaveFormValues({
      target_ca_users_only: 'false',
    })
    expect(screen.getByText('10').closest('button')).toBeNull()
    expect(
      screen.getByRole('link', {
        name: 'View running digest job for 2026-08-12',
      }),
    ).toHaveAttribute('href', '/admin/digest?run=run-12')
    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(screen.getByText('July 2026')).toBeVisible()
    expect(
      screen.getByRole('button', {
        name: 'Generate digest for 2026-07-11',
      }),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Next month' })).toBeVisible()
    expect(
      screen.getByText(/Amber days are running and safe to leave/),
    ).toBeVisible()
  })
  describe('week links', () => {
    const novemberDays = ['2026-11-02', '2026-11-03', '2026-11-09'].map(
      (digestDate) => ({ digestDate, isPreview: false }),
    )

    test('adds an arrow per week that has an edition and marks the viewed week', () => {
      render(
        <DigestDaySelector
          currentDate="2026-11-09"
          availableDays={novemberDays}
          variant="editorial"
          week={{ start: '2026-11-09', end: '2026-11-15' }}
          weekLinks={{ weeks: ['2026-11-09', '2026-11-02', '2026-10-26'] }}
          title="Daily editions"
        />,
      )
      // The row holding 1 November starts on Monday 26 October.
      const october26 = screen.getByRole('link', { name: 'Week of 26 October' })
      expect(october26).toHaveAttribute('href', '/digest/week/2026-10-26')
      expect(october26).toHaveAttribute('title', 'Week of 26 October')
      expect(
        screen.getByRole('link', { name: 'Week of 2 November' }),
      ).toHaveAttribute('href', '/digest/week/2026-11-02')
      // The viewed week's arrow is not a link, and its row is tinted.
      expect(
        screen.queryByRole('link', { name: 'Week of 9 November' }),
      ).toBeNull()
      const here = screen.getByRole('img', {
        name: 'Week of 9 November, this page',
      })
      expect(here.parentElement).toHaveClass('bg-blue-50')
      expect(october26.parentElement).not.toHaveClass('bg-blue-50')
      // Weeks without an edition get no arrow.
      expect(
        screen.queryByRole('link', { name: 'Week of 16 November' }),
      ).toBeNull()
      expect(screen.getByText(/→ opens the week/)).toBeVisible()
    })

    test('links every week with an edition from a daily page', () => {
      render(
        <DigestDaySelector
          currentDate="2026-11-09"
          availableDays={novemberDays}
          variant="editorial"
          weekLinks={{ weeks: ['2026-11-09', '2026-11-02'] }}
        />,
      )
      expect(
        screen.getByRole('link', { name: 'Week of 9 November' }),
      ).toHaveAttribute('href', '/digest/week/2026-11-09')
      expect(screen.getByRole('link', { name: '2026-11-09' })).toHaveAttribute(
        'aria-current',
        'date',
      )
      expect(screen.queryByRole('img')).toBeNull()
    })

    test('keeps the plain seven-column calendar without week links', () => {
      render(
        <DigestDaySelector
          currentDate="2026-11-09"
          availableDays={novemberDays}
          variant="editorial"
        />,
      )
      expect(screen.queryByRole('link', { name: /^Week of/ })).toBeNull()
      expect(screen.queryByText(/opens the week/)).toBeNull()
    })
  })
})
