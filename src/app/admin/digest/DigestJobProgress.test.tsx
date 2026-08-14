/** @jest-environment jsdom */

import React from 'react'
import '@testing-library/jest-dom'
import { act, render, screen } from '@testing-library/react'
import { DigestJobProgress } from './DigestJobProgress'

const refresh = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

describe('DigestJobProgress', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-08-14T17:00:10.000Z'))
    refresh.mockReset()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  test('shows durable progress and refreshes the saved run state', () => {
    render(
      <DigestJobProgress
        runId="ed9d44f3-2215-489e-a3c0-284c84e963cb"
        startedAt="2026-08-14T17:00:00.000Z"
        workflowRunId="wrun_123"
        events={[
          {
            at: '2026-08-14T17:00:01.000Z',
            stage: 'commentary',
            status: 'started',
            message: 'Fetching commentary.',
          },
        ]}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent(
      'Digest generation is running',
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'Safe to refresh, close this tab, or browse elsewhere',
    )
    expect(screen.getByText('Job queued').parentElement).toHaveTextContent('✓')
    expect(
      screen.getByText('Gathering replies and quotes').parentElement,
    ).toHaveTextContent('●')

    act(() => jest.advanceTimersByTime(3_000))
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
