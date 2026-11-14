/** @jest-environment jsdom */

import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { AskUsageSection } from './AskUsageSection'
import { loadAskUsage } from './askUsageData'

jest.mock('./askUsageData', () => ({
  ASK_USAGE_DAYS: 14,
  loadAskUsage: jest.fn(),
}))

const totals = {
  questions: 12,
  askers: 5,
  failed: 1,
  ownKey: 2,
  inputTokens: 3_400_000,
  outputTokens: 180_000,
  costUsd: 0.5,
}

test('shows spend against the daily cap, the month and each day', async () => {
  jest.mocked(loadAskUsage).mockResolvedValueOnce({
    daily: [{ day: '2026-11-13', ...totals }],
    today: { day: '2026-11-13', ...totals },
    month: { ...totals, questions: 40, askers: 9, costUsd: 1.75 },
    launched: true,
    enabled: true,
    globalDailyUsd: 25,
  })
  render(await AskUsageSection())

  expect(screen.getByText('Live')).toBeInTheDocument()
  expect(screen.getByText('$0.50 of $25.00')).toBeInTheDocument()
  expect(screen.getByText('$1.75')).toBeInTheDocument()
  expect(screen.getByText('40 questions · 9 askers')).toBeInTheDocument()
  expect(screen.getByRole('row', { name: /2026-11-13/ })).toHaveTextContent(
    '2026-11-13125123.4M180K$0.50',
  )
})

test('says so when usage cannot be loaded', async () => {
  jest.mocked(loadAskUsage).mockRejectedValueOnce(new Error('down'))
  render(await AskUsageSection())
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Usage could not be loaded',
  )
})
