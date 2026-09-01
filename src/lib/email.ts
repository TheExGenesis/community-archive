import 'server-only'

import { Resend } from 'resend'

// Sender must stay on the Resend-verified domain (community-archive.org).
const DEFAULT_FROM = 'Community Archive <no-reply@community-archive.org>'

export type SendEmailInput = {
  to: string | string[]
  subject: string
  html: string
  text?: string
  replyTo?: string
  from?: string
}

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string }

let client: Resend | null = null

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not set')
  }
  client ??= new Resend(apiKey)
  return client
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const { to, subject, html, text, replyTo, from = DEFAULT_FROM } = input

  let resend: Resend
  try {
    resend = getResendClient()
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }

  const { data, error } = await resend.emails.send({
    from,
    to,
    subject,
    html,
    text,
    replyTo,
  })

  if (error) {
    return { ok: false, error: error.message }
  }
  if (!data) {
    return { ok: false, error: 'Resend returned no message id' }
  }
  return { ok: true, id: data.id }
}
