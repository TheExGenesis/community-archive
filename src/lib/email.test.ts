jest.mock('server-only', () => ({}))

const sendMock = jest.fn()
jest.mock('resend', () => ({
  Resend: jest.fn(() => ({ emails: { send: sendMock } })),
}))

describe('sendEmail', () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    jest.resetModules()
    sendMock.mockReset()
    process.env = { ...ORIGINAL_ENV, RESEND_API_KEY: 're_test_key' }
  })

  afterAll(() => {
    process.env = ORIGINAL_ENV
  })

  async function loadSendEmail() {
    const { sendEmail } = await import('./email')
    return sendEmail
  }

  it('returns the message id on success', async () => {
    sendMock.mockResolvedValue({ data: { id: 'msg_123' }, error: null })
    const sendEmail = await loadSendEmail()

    const result = await sendEmail({
      to: 'someone@example.com',
      subject: 'Hello',
      html: '<p>Hi</p>',
    })

    expect(result).toEqual({ ok: true, id: 'msg_123' })
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'someone@example.com',
        subject: 'Hello',
        from: expect.stringContaining('@community-archive.org'),
      })
    )
  })

  it('returns the Resend error without throwing', async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { message: 'domain not verified' },
    })
    const sendEmail = await loadSendEmail()

    const result = await sendEmail({
      to: 'someone@example.com',
      subject: 'Hello',
      html: '<p>Hi</p>',
    })

    expect(result).toEqual({ ok: false, error: 'domain not verified' })
  })

  it('fails cleanly when RESEND_API_KEY is missing', async () => {
    delete process.env.RESEND_API_KEY
    const sendEmail = await loadSendEmail()

    const result = await sendEmail({
      to: 'someone@example.com',
      subject: 'Hello',
      html: '<p>Hi</p>',
    })

    expect(result).toEqual({ ok: false, error: 'RESEND_API_KEY is not set' })
    expect(sendMock).not.toHaveBeenCalled()
  })
})
