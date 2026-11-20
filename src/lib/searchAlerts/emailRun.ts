import 'server-only'

import type { SendEmailInput, SendEmailResult } from '@/lib/email'
import type { PortalTweet } from '@/lib/portal/types'
import {
  EMAIL_TWEETS_PER_ALERT,
  renderSearchAlertEmail,
  type SearchAlertEmailSection,
} from './emailTemplate'
import type { ClaimedAlertMatches } from './store'

export interface SearchAlertEmailDeps {
  listUsers: () => Promise<string[]>
  claim: (userId: string) => Promise<string | null>
  load: (
    sendId: string,
  ) => Promise<{ unsubscribeToken: string; alerts: ClaimedAlertMatches[] }>
  complete: (sendId: string, messageId: string) => Promise<void>
  release: (sendId: string) => Promise<void>
  userEmail: (userId: string) => Promise<string | null>
  tweetCards: (ids: string[]) => Promise<Map<string, PortalTweet>>
  send: (input: SendEmailInput) => Promise<SendEmailResult>
  links: {
    siteUrl: string
    settingsUrl: string
    unsubscribeUrl: (token: string) => string
  }
  sleep?: (ms: number) => Promise<void>
  /** Resend allows ~2 requests/second; stay under it. */
  sendIntervalMs?: number
}

export interface SearchAlertEmailResult {
  users: number
  sent: number
  skipped: number
  failed: number
}

/** Builds one roll-up for claimed matches, hydrating a few tweets per alert. */
export async function buildSearchAlertSections(
  alerts: ClaimedAlertMatches[],
  tweetCards: SearchAlertEmailDeps['tweetCards'],
): Promise<SearchAlertEmailSection[]> {
  const wanted = alerts.flatMap((alert) =>
    alert.tweets.slice(0, EMAIL_TWEETS_PER_ALERT).map((tweet) => tweet.id),
  )
  const cards = await tweetCards(wanted).catch((error) => {
    console.error('Search alert email tweet cards failed:', error)
    return new Map<string, PortalTweet>()
  })
  return alerts.map((alert) => ({
    query: alert.query,
    fromUser: alert.fromUser,
    count: alert.count,
    since: alert.since,
    tweets: alert.tweets.slice(0, EMAIL_TWEETS_PER_ALERT).flatMap((tweet) => {
      const card = cards.get(tweet.id)
      return card ? [card] : []
    }),
  }))
}

/**
 * One daily pass: each user with unsent matches on email-enabled alerts gets
 * one email. Matches are claimed before sending, so a re-run never sends
 * them twice; a failed send releases the claim for tomorrow.
 */
export async function runSearchAlertEmails(
  deps: SearchAlertEmailDeps,
): Promise<SearchAlertEmailResult> {
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
  const users = await deps.listUsers()
  const result: SearchAlertEmailResult = {
    users: users.length,
    sent: 0,
    skipped: 0,
    failed: 0,
  }
  let attempted = 0
  for (const userId of users) {
    let sendId: string | null = null
    let delivered = false
    try {
      const email = await deps.userEmail(userId)
      if (!email) {
        result.skipped += 1
        continue
      }
      sendId = await deps.claim(userId)
      if (!sendId) {
        result.skipped += 1
        continue
      }
      const claimed = await deps.load(sendId)
      if (claimed.alerts.length === 0) {
        await deps.release(sendId)
        result.skipped += 1
        continue
      }
      const sections = await buildSearchAlertSections(
        claimed.alerts,
        deps.tweetCards,
      )
      const unsubscribeUrl = deps.links.unsubscribeUrl(claimed.unsubscribeToken)
      const rendered = renderSearchAlertEmail(sections, {
        siteUrl: deps.links.siteUrl,
        settingsUrl: deps.links.settingsUrl,
        unsubscribeUrl,
      })
      if (attempted > 0) await sleep(deps.sendIntervalMs ?? 600)
      attempted += 1
      const sent = await deps.send({
        to: email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      })
      delivered = sent.ok
      if (!sent.ok) {
        console.error('Search alert email failed:', sent.error)
        await deps.release(sendId)
        result.failed += 1
        continue
      }
      await deps.complete(sendId, sent.id)
      result.sent += 1
    } catch (error) {
      console.error(
        'Search alert email run error:',
        error instanceof Error ? error.message : error,
      )
      result.failed += 1
      // Release a claim that never reached the mailbox; a delivered email
      // keeps its claim even if recording it failed, so it is not resent.
      if (sendId && !delivered)
        await deps.release(sendId).catch(() => undefined)
    }
  }
  return result
}
