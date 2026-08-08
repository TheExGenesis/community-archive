/** @jest-environment jsdom */

import '@testing-library/jest-dom'
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TrendsExplorer from '@/components/portal/TrendsExplorer'
import { emptyPortalTrends } from './trendConfig'
import type { PortalTrends } from './types'
;(globalThis as typeof globalThis & { React: typeof React }).React = React

const successfulTrends: PortalTrends = {
  years: [2025, 2026],
  series: [
    {
      term: 'tpot',
      color: '#3b82f6',
      tweetsPerYear: [10, 20],
      perYear: [100, 200],
    },
  ],
  weekly: [],
  computedAt: '2026-08-07T12:00:00.000Z',
}

describe('TrendsExplorer request isolation', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('keeps the explorer controls available when its initial snapshot fails', () => {
    const fetchMock = jest.spyOn(global, 'fetch')

    render(
      <TrendsExplorer
        initialTrends={emptyPortalTrends(new Date('2026-08-07T12:00:00.000Z'))}
        initialLoadFailed
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Trends explorer' }),
    ).toBeVisible()
    expect(screen.getByLabelText('Words or phrases to chart')).toBeEnabled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Chart data unavailable',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('keeps the chart rendered when the matching-tweet request fails', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Matching tweets are unavailable' }),
    } as Response)

    render(<TrendsExplorer initialTrends={successfulTrends} />)

    expect(
      await screen.findByText('Matching tweets are unavailable'),
    ).toBeVisible()
    expect(screen.getByText('Frequency per 100k tweets')).toBeVisible()
    expect(
      screen.getByRole('img', { name: /Yearly term trends/ }),
    ).toBeVisible()
  })

  test('retries only the failed chart data', async () => {
    const user = userEvent.setup()
    const years = [2019, 2020]
    const series = [
      {
        term: 'tpot',
        color: '#3b82f6',
        tweetsPerYear: [1, 2],
        perYear: [10, 20],
      },
    ]
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          years,
          series,
          computedAt: '2026-08-07T12:00:00.000Z',
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tweets: [] }),
      } as Response)

    render(
      <TrendsExplorer
        initialTrends={emptyPortalTrends(new Date('2026-08-07T12:00:00.000Z'))}
        initialLoadFailed
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Retry defaults' }))

    await waitFor(() =>
      expect(
        screen.queryByText('Chart data unavailable.'),
      ).not.toBeInTheDocument(),
    )
    expect(screen.getByText('1/12 trends')).toBeVisible()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
