import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RefreshControls } from './RefreshControls'
import {
  getRefreshState,
  requestRefresh,
} from '@/app/admin/bulletin/refreshActions'

jest.mock('@/app/admin/bulletin/refreshActions', () => ({
  getRefreshState: jest.fn(),
  requestRefresh: jest.fn(),
}))
beforeEach(() => {
  jest.resetAllMocks()
  Object.defineProperty(crypto, 'randomUUID', {
    configurable: true,
    value: jest.fn(() => '00000000-0000-4000-8000-000000000001'),
  })
  jest
    .mocked(getRefreshState)
    .mockResolvedValue({ enabled: true, requests: [] })
})
test('blocks unsaved prompt edits and submits the selected window after saving', async () => {
  jest.mocked(requestRefresh).mockResolvedValue({ id: 'request' })
  const { rerender } = render(<RefreshControls promptId="2" dirty />)
  await waitFor(() => expect(getRefreshState).toHaveBeenCalled())
  expect(screen.getByRole('button', { name: 'Queue refresh' })).toBeDisabled()
  rerender(<RefreshControls promptId="3" />)
  fireEvent.change(screen.getByLabelText('Window'), {
    target: { value: 'two_weeks' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Queue refresh' }))
  await waitFor(() => expect(requestRefresh).toHaveBeenCalledTimes(1))
  const data = jest.mocked(requestRefresh).mock.calls[0][0]
  expect(data.get('prompt_id')).toBe('3')
  expect(data.get('selection')).toBe('two_weeks')
  expect(data.get('budget')).toBe('0.10')
  await screen.findByText(/Refresh queued/)
})
test('ambiguous network failures retry the same request ID', async () => {
  jest.mocked(requestRefresh).mockRejectedValue(new Error('network'))
  render(<RefreshControls promptId="2" />)
  const button = screen.getByRole('button', { name: 'Queue refresh' })
  await waitFor(() => expect(button).toBeEnabled())
  fireEvent.click(button)
  await screen.findByText(/Could not confirm/)
  fireEvent.click(button)
  await waitFor(() => expect(requestRefresh).toHaveBeenCalledTimes(2))
  expect(
    jest
      .mocked(requestRefresh)
      .mock.calls.map(([data]) => data.get('request_id')),
  ).toEqual([
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
  ])
})
test('an active request blocks duplicate submissions and displays progress', async () => {
  jest.mocked(getRefreshState).mockResolvedValue({
    enabled: true,
    requests: [
      {
        id: 'r',
        status: 'running',
        prompt_id: '2',
        budget_usd: 0.1,
        spent_usd: 0.02,
        created_at: '2026-09-10T00:00:00Z',
        window_start: '2026-09-08T00:00:00Z',
        window_end: '2026-09-10T00:00:00Z',
        last_status: null,
        counts: { rows_seen: 500, pending: 4 },
      },
    ],
  })
  render(<RefreshControls promptId="2" />)
  expect(
    await screen.findByRole('button', { name: 'Refresh in progress' }),
  ).toBeDisabled()
  expect(screen.getByText(/4 candidates remaining/)).toBeInTheDocument()
  expect(requestRefresh).not.toHaveBeenCalled()
})
