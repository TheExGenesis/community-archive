import { StrictMode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { DigestViewCount } from './DigestViewCount'

test('counts once during Strict Mode mounting and displays the updated total', async () => {
  const fetcher = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ count: 1234 }),
  })
  const previousFetch = global.fetch
  global.fetch = fetcher as typeof fetch
  try {
    render(
      <StrictMode>
        <DigestViewCount editionId="edition-1" />
      </StrictMode>,
    )
    await waitFor(() => {
      expect(screen.getByText('1,234 views')).toBeInTheDocument()
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledWith('/api/digest/edition-1/view', {
      method: 'POST',
    })
  } finally {
    global.fetch = previousFetch
  }
})
