import {
  buildArchiveCompletionEmail,
  isAuthorizedCronRequest,
  sendArchiveCompletionEmail,
  type ClaimedArchiveCompletionNotification,
} from './archiveCompletionNotifications'

const notification: ClaimedArchiveCompletionNotification = {
  id: 17,
  recipient_email: 'member@example.com',
  account_id: '123456',
  archive_username: '<member>',
  archive_at: '2026-08-15T00:00:00.000Z',
}

describe('archive completion notifications', () => {
  it('requires an exact configured cron bearer token', () => {
    expect(isAuthorizedCronRequest('Bearer correct', 'correct')).toBe(true)
    expect(isAuthorizedCronRequest('Bearer wrong', 'correct')).toBe(false)
    expect(isAuthorizedCronRequest('Bearer undefined', undefined)).toBe(false)
  })

  it('builds a plain-text fallback and escapes user-controlled HTML', () => {
    const email = buildArchiveCompletionEmail(
      notification,
      'Community Archive <archive@example.com>',
    )

    expect(email.to).toEqual(['member@example.com'])
    expect(email.text).toContain('@<member>')
    expect(email.html).toContain('@&lt;member&gt;')
    expect(email.html).not.toContain('@<member>')
    expect(email.html).toContain('/user/123456')
  })

  it('uses a stable outbox idempotency key for provider retries', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: 'email_123' }), { status: 200 }),
      )

    await expect(
      sendArchiveCompletionEmail({
        notification,
        apiKey: 'secret',
        from: 'archive@example.com',
        fetchImpl,
      }),
    ).resolves.toBe('email_123')

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Idempotency-Key': 'archive-completion/17',
        }),
      }),
    )
  })

  it('surfaces provider errors without treating them as delivered', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ message: 'rate limited' }), {
          status: 429,
        }),
      )

    await expect(
      sendArchiveCompletionEmail({
        notification,
        apiKey: 'secret',
        from: 'archive@example.com',
        fetchImpl,
      }),
    ).rejects.toThrow('rate limited')
  })
})
