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
    jest.spyOn(window, 'confirm').mockReturnValue(false)
  })

  afterEach(() => jest.restoreAllMocks())

  it('expands into an email form and reports success', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'subscribed' }),
    })
    render(<DigestSubscribeButton />)

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Subscribe' })).toBeEnabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }))
    const input = screen.getByLabelText('Email address for the daily digest')
    fireEvent.change(input, { target: { value: 'someone@example.com' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(() =>
      expect(screen.getByText('Subscribed ✓')).toBeInTheDocument(),
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

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Subscribe' })).toBeEnabled(),
    )
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

  it('surfaces the unsubscribe-redirect message', async () => {
    searchParams.set('email', 'unsubscribed')
    render(<DigestSubscribeButton />)
    expect(screen.getByText('Unsubscribed ✓')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Subscribe' })).toBeEnabled(),
    )
  })

  const id = 'b4f865c8-f05a-4f86-975f-a2a6edfd3981'
  const subscriber = { status: 'subscribed', id, email: 're••••@example.com' }
  const response = (body: unknown, ok = true) => ({
    ok,
    json: async () => body,
  })

  it('recognizes an existing subscriber and cancels without sending an unsubscribe request', async () => {
    jest.mocked(fetch).mockResolvedValueOnce(response(subscriber) as Response)
    render(<DigestSubscribeButton />)
    fireEvent.click(await screen.findByRole('button', { name: 'Subscribed' }))
    expect(window.confirm).toHaveBeenCalledWith(
      'Are you sure you want to unsubscribe re••••@example.com from the Daily Digest?',
    )
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Subscribed' })).toBeEnabled()
  })

  it('unsubscribes the displayed subscription only after confirmation', async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(response(subscriber) as Response)
      .mockResolvedValueOnce(response({ status: 'unsubscribed' }) as Response)
    jest.mocked(window.confirm).mockReturnValue(true)
    render(<DigestSubscribeButton />)
    fireEvent.click(await screen.findByRole('button', { name: 'Subscribed' }))
    expect(
      await screen.findByRole('button', { name: 'Subscribe' }),
    ).toBeEnabled()
    expect(screen.getByText('Unsubscribed ✓')).toBeInTheDocument()
    expect(fetch).toHaveBeenLastCalledWith(
      '/api/digest/email/settings',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ action: 'unsubscribe', subscriptionId: id }),
      }),
    )
  })

  it('keeps the subscribed state when unsubscribe fails', async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(response(subscriber) as Response)
      .mockRejectedValueOnce(new Error('Connection lost'))
    jest.mocked(window.confirm).mockReturnValue(true)
    render(<DigestSubscribeButton />)
    fireEvent.click(await screen.findByRole('button', { name: 'Subscribed' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Connection lost',
    )
    expect(screen.getByRole('button', { name: 'Subscribed' })).toBeEnabled()
  })

  it('lets a newly subscribed signed-in account unsubscribe without reloading', async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(response({ status: 'none' }) as Response)
      .mockResolvedValueOnce(
        response({
          status: 'subscribed',
          subscriptionId: id,
          email: subscriber.email,
        }) as Response,
      )
    render(<DigestSubscribeButton />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Subscribe' })).toBeEnabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }))
    const input = screen.getByLabelText('Email address for the daily digest')
    fireEvent.change(input, { target: { value: 'reader@example.com' } })
    fireEvent.submit(input.closest('form')!)
    fireEvent.click(await screen.findByRole('button', { name: 'Subscribed' }))
    expect(window.confirm).toHaveBeenCalledTimes(1)
  })
})
