import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DigestSubscribeButton } from './DigestSubscribeButton'

const searchParams = new URLSearchParams()
jest.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
}))

describe('DigestSubscribeButton', () => {
  beforeEach(() => {
    searchParams.delete('email')
    global.fetch = jest.fn()
  })

  it('expands into an email form and reports success', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'pending' }),
    })
    render(<DigestSubscribeButton />)

    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }))
    const input = screen.getByLabelText('Email address for the daily digest')
    fireEvent.change(input, { target: { value: 'someone@example.com' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(() =>
      expect(screen.getByText('Check your inbox ✓')).toBeInTheDocument(),
    )
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/digest/email/subscribe',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('shows the server error and stays open on failure', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Please provide a valid email address.' }),
    })
    render(<DigestSubscribeButton />)

    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }))
    const input = screen.getByLabelText('Email address for the daily digest')
    fireEvent.change(input, { target: { value: 'nope@example.com' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(() =>
      expect(
        screen.getByText('Please provide a valid email address.'),
      ).toBeInTheDocument(),
    )
    expect(
      screen.getByLabelText('Email address for the daily digest'),
    ).toBeInTheDocument()
  })

  it('surfaces the confirm-redirect message', () => {
    searchParams.set('email', 'confirmed')
    render(<DigestSubscribeButton />)
    expect(screen.getByText('Subscription confirmed ✓')).toBeInTheDocument()
  })
})
