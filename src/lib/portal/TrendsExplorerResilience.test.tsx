/** @jest-environment jsdom */

import '@testing-library/jest-dom'
import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TrendsExplorer from '@/components/portal/TrendsExplorer'
import { CHART_TERMS, emptyPortalTrends } from './trendConfig'
import type { PortalTrends } from './types'
import { capturePostHogEvent } from '@/lib/posthog'
;(globalThis as typeof globalThis & { React: typeof React }).React = React

jest.mock('@/lib/posthog', () => ({
  capturePostHogEvent: jest.fn(),
}))
const mockCapturePostHogEvent = capturePostHogEvent as jest.Mock

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))

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

const twoTrends: PortalTrends = {
  ...successfulTrends,
  series: [
    successfulTrends.series[0],
    {
      term: 'postrat',
      color: '#f59e0b',
      tweetsPerYear: [5, 8],
      perYear: [50, 80],
    },
  ],
}

const defaultTrends: PortalTrends = {
  ...successfulTrends,
  series: CHART_TERMS.map(({ term, color }, index) => ({
    term,
    color,
    tweetsPerYear: [index + 1, index + 2],
    perYear: [(index + 1) * 10, (index + 2) * 10],
  })),
}

function feedTweet(id: string, year: number) {
  const createdAt = `${year}-06-01T00:00:00.000Z`
  return {
    id,
    username: 'alice',
    name: 'Alice',
    avatar: null,
    text: `tweet-${year}-${id}`,
    observedAt: createdAt,
    createdAt,
    likes: 0,
    rts: 0,
  }
}

describe('TrendsExplorer request isolation', () => {
  beforeEach(() => {
    mockCapturePostHogEvent.mockReset()
  })

  afterEach(() => {
    jest.useRealTimers()
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
          granularity: 'year',
          buckets: years.map(String),
          series: series.map((item) => ({
            term: item.term,
            color: item.color,
            tweetsPerBucket: item.tweetsPerYear,
            perBucket: item.perYear,
          })),
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
    expect(screen.getByText('7/12 trends')).toBeVisible()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test('removes terms and uses a binary include filter', async () => {
    const user = userEvent.setup()
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ tweets: [] }),
    } as Response)

    render(<TrendsExplorer initialTrends={successfulTrends} />)

    const included = await screen.findByRole('button', {
      name: 'tpot is included. Click to turn it off.',
    })
    await user.click(included)
    expect(mockCapturePostHogEvent).toHaveBeenCalledWith(
      'trends_explorer_action',
      {
        action: 'evidence_filter_toggled',
        series_count: 1,
        enabled_series_count: 1,
        included_series_count: 0,
        has_year_filter: false,
      },
    )
    expect(
      screen.getByRole('button', {
        name: 'tpot is off. Click to include it.',
      }),
    ).toBeVisible()
    expect(screen.queryByText(/exclude/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove tpot trend' }))
    expect(mockCapturePostHogEvent).toHaveBeenLastCalledWith(
      'trends_explorer_action',
      {
        action: 'term_removed',
        series_count: 0,
        enabled_series_count: 0,
        included_series_count: 0,
        has_year_filter: false,
      },
    )
    expect(
      screen.queryByRole('button', { name: 'Remove tpot trend' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('0/12 trends')).toBeVisible()
  })

  test('replaces defaults with the first custom trend, then preserves later additions', async () => {
    const user = userEvent.setup()
    jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const requestUrl = new URL(String(url), 'https://example.com')
      if (requestUrl.searchParams.get('view') === 'series') {
        const terms = requestUrl.searchParams.getAll('q')
        return {
          ok: true,
          json: async () => ({
            granularity: 'year',
            buckets: ['2025', '2026'],
            series: terms.map((term) => ({
              term,
              color: '#3b82f6',
              tweetsPerBucket: [1, 2],
              perBucket: [10, 20],
            })),
          }),
        } as Response
      }
      return {
        ok: true,
        json: async () => ({ tweets: [] }),
      } as Response
    })

    render(<TrendsExplorer initialTrends={defaultTrends} />)
    const input = screen.getByLabelText('Words or phrases to chart')

    await user.type(input, 'custom idea')
    await user.click(screen.getByRole('button', { name: 'Add trends' }))
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Remove custom idea trend' }),
      ).toBeVisible(),
    )
    expect(
      screen.queryByRole('button', { name: 'Remove tpot trend' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('1/12 trends')).toBeVisible()

    await user.type(input, 'second idea')
    await user.click(screen.getByRole('button', { name: 'Add trends' }))
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Remove second idea trend' }),
      ).toBeVisible(),
    )
    expect(
      screen.getByRole('button', { name: 'Remove custom idea trend' }),
    ).toBeVisible()
    expect(screen.getByText('2/12 trends')).toBeVisible()
  })

  test('lets the root layout own the viewport height without extra page length', () => {
    jest
      .spyOn(global, 'fetch')
      .mockImplementation(() => new Promise<Response>(() => undefined))

    render(<TrendsExplorer initialTrends={successfulTrends} />)

    const main = screen.getByRole('main')
    expect(main).toHaveClass('flex-1')
    expect(main).not.toHaveClass('min-h-screen')
  })

  test('loads only a newly included term when prior term evidence is cached', async () => {
    const user = userEvent.setup()
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ tweets: [] }),
    } as Response)

    render(<TrendsExplorer initialTrends={twoTrends} />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(String(fetchMock.mock.calls[0][0])).toContain('include=tpot')

    await user.click(
      screen.getByRole('button', {
        name: 'postrat is off. Click to include it.',
      }),
    )

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(String(fetchMock.mock.calls[1][0])).toContain('include=postrat')
    expect(String(fetchMock.mock.calls[1][0])).not.toContain('include=tpot')
  })

  test('filters cached evidence immediately and debounces the range query', async () => {
    jest.useFakeTimers()
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tweets: [feedTweet('old', 2025), feedTweet('new', 2026)],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tweets: [feedTweet('range', 2025)] }),
      } as Response)

    render(<TrendsExplorer initialTrends={successfulTrends} />)

    expect(await screen.findByText('tweet-2025-old')).toBeVisible()
    expect(screen.getByText('tweet-2026-new')).toBeVisible()
    await user.selectOptions(screen.getByLabelText('Tweets from year'), '2025')

    expect(screen.getByText('tweet-2025-old')).toBeVisible()
    expect(screen.queryByText('tweet-2026-new')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    act(() => jest.advanceTimersByTime(1_199))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    act(() => jest.advanceTimersByTime(1))
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) =>
          String(url).includes('since=2025-01-01&until=2026-01-01'),
        ),
      ).toBe(true),
    )
    expect(await screen.findByText('tweet-2025-range')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Clear range' })).toBeVisible()
  })

  test('skips a range top-up when a broader cache has a full page', async () => {
    jest.useFakeTimers()
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    const tweets = Array.from({ length: 30 }, (_, index) =>
      feedTweet(String(index), 2026),
    )
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ tweets }),
    } as Response)

    render(<TrendsExplorer initialTrends={successfulTrends} />)

    expect(await screen.findByText('tweet-2026-0')).toBeVisible()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await user.selectOptions(screen.getByLabelText('Tweets from year'), '2026')

    expect(screen.getByText('tweet-2026-0')).toBeVisible()
    expect(
      screen.queryByText('Updating this period in the background…'),
    ).not.toBeInTheDocument()
    act(() => jest.advanceTimersByTime(1_200))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('does not query during a pointer drag and debounces after release', async () => {
    jest.useFakeTimers()
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ tweets: [] }),
    } as Response)

    render(<TrendsExplorer initialTrends={successfulTrends} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    const chart = screen.getByRole('img', {
      name: /Yearly term trends shown as/,
    })
    Object.defineProperty(chart, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 760 }),
    })
    const dragTarget = screen.getByLabelText(
      'Drag horizontally to filter tweets by year',
    ) as unknown as SVGRectElement & { setPointerCapture: jest.Mock }
    dragTarget.setPointerCapture = jest.fn()
    const dispatchPointer = (type: string, clientX: number) => {
      const event = new Event(type, { bubbles: true })
      Object.defineProperties(event, {
        clientX: { value: clientX },
        pointerId: { value: 1 },
      })
      fireEvent(dragTarget, event)
    }

    dispatchPointer('pointerdown', 62)
    expect(screen.getByLabelText('Tweets from year')).toHaveValue('')
    dispatchPointer('pointermove', 732)
    await waitFor(() =>
      expect(screen.getByLabelText('Tweets through year')).toHaveValue('2026'),
    )
    act(() => jest.advanceTimersByTime(5_000))
    expect(fetchMock).toHaveBeenCalledTimes(1)

    dispatchPointer('pointerup', 732)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Clear range' })).toBeVisible(),
    )
    act(() => jest.advanceTimersByTime(1_199))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await act(async () => {
      jest.advanceTimersByTime(1)
      await Promise.resolve()
      await Promise.resolve()
    })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(
      await screen.findByText('No matching tweets in this period.'),
    ).toBeVisible()
  })

  test('keeps an existing range when the chart is clicked without dragging', async () => {
    const user = userEvent.setup()
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ tweets: [] }),
    } as Response)

    render(<TrendsExplorer initialTrends={successfulTrends} />)
    await user.selectOptions(screen.getByLabelText('Tweets from year'), '2025')

    const chart = screen.getByRole('img', {
      name: /Yearly term trends shown as/,
    })
    Object.defineProperty(chart, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 760 }),
    })
    const dragTarget = screen.getByLabelText(
      'Drag horizontally to filter tweets by year',
    ) as unknown as SVGRectElement & { setPointerCapture: jest.Mock }
    dragTarget.setPointerCapture = jest.fn()
    const dispatchPointer = (type: string, clientX: number) => {
      const event = new Event(type, { bubbles: true })
      Object.defineProperties(event, {
        clientX: { value: clientX },
        pointerId: { value: 1 },
      })
      fireEvent(dragTarget, event)
    }

    dispatchPointer('pointerdown', 732)
    dispatchPointer('pointerup', 732)

    expect(screen.getByLabelText('Tweets from year')).toHaveValue('2025')
    expect(screen.getByLabelText('Tweets through year')).toHaveValue('2025')
  })

  test('restores shareable month state and uses exact month evidence bounds', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (url) => {
        const requestUrl = String(url)
        if (requestUrl.includes('view=series')) {
          return {
            ok: true,
            json: async () => ({
              granularity: 'month',
              buckets: ['2026-07', '2026-08'],
              series: [
                {
                  term: 'tpot',
                  color: '#3b82f6',
                  tweetsPerBucket: [4, 7],
                  perBucket: [40, 70],
                },
              ],
              computedAt: '2026-08-07T12:00:00.000Z',
            }),
          } as Response
        }
        return {
          ok: true,
          json: async () => ({ tweets: [] }),
        } as Response
      })

    render(
      <TrendsExplorer
        initialTrends={successfulTrends}
        initialSearch="q=tpot&show=tpot&include=tpot&scale=raw&granularity=month&from=2026-07&to=2026-08"
      />,
    )

    expect(screen.getByRole('button', { name: 'Months' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByLabelText('Tweets from month')).toHaveValue('2026-07')
    expect(screen.getByLabelText('Tweets through month')).toHaveValue('2026-08')
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) =>
          String(url).includes('view=series&granularity=month&q=tpot'),
        ),
      ).toBe(true),
    )
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes('since=2026-07-01&until=2026-09-01'),
      ),
    ).toBe(true)
  })
})
