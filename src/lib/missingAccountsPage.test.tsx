import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'

import MissingAccountsPage from '@/app/missing-accounts/page'
import {
  getMissingAccounts,
  type MissingAccountsResponse,
} from '@/lib/missingAccounts'

jest.mock('@/lib/missingAccounts', () => ({
  getMissingAccounts: jest.fn(),
}))

Object.defineProperty(globalThis, 'React', { value: React })

const getMissingAccountsMock = getMissingAccounts as jest.MockedFunction<
  typeof getMissingAccounts
>

const response: MissingAccountsResponse = {
  data: {
    needsOptIn: [
      {
        rank: 1,
        accountId: '1',
        username: 'deepfates',
        displayName: 'deepfates',
        avatarUrl: null,
        referenceCount: '19558',
        mentionCount: '0',
        replyCount: '19558',
      },
    ],
    needsArchive: [
      {
        rank: 1,
        accountId: '2',
        username: 'tszzl',
        displayName: 'roon',
        avatarUrl: null,
        referenceCount: '18024',
        mentionCount: '0',
        replyCount: '18024',
      },
    ],
    topRepliers: [
      {
        rank: 1,
        accountId: '3',
        username: 'space_punk',
        displayName: 'space punk',
        avatarUrl: null,
        referenceCount: '1080',
        mentionCount: '0',
        replyCount: '1080',
      },
    ],
  },
  query: {
    limit: 100,
    countMode: 'unique_reply_tweets',
    includesMentions: false,
    includesReplies: true,
  },
  generatedAt: '2026-08-07T00:00:00.000Z',
  timing: {
    wallMs: 1,
    clickhouseMs: 1,
    rowsRead: 1,
    bytesRead: 1,
  },
}

beforeEach(() => {
  getMissingAccountsMock.mockResolvedValue(response)
})

// The href of the tab marked as the current view.
function currentTabHref(html: string): string[] {
  return Array.from(html.matchAll(/<a\b[^>]*aria-current="page"[^>]*>/g)).map(
    ([tag]) => /href="([^"]*)"/.exec(tag)?.[1] ?? '',
  )
}

test('explains the not-opted-in view in plain language', async () => {
  const html = renderToStaticMarkup(
    await MissingAccountsPage({ searchParams: {} }),
  )

  expect(html).toContain(
    'These are the accounts mentioned most often in the Community Archive that haven’t opted in yet.',
  )
  expect(html).toContain('Not opted in yet')
  expect(html).toContain('Not opted in')
  expect(html).toContain('Most replied to first')
  expect(html).toContain(
    'Accounts ordered by how often archived posts reply to them',
  )
  expect(html).toContain('>posts<')
  expect(currentTabHref(html)).toEqual(['/missing-accounts'])
  expect(html).not.toMatch(/needs? to opt in/i)
  expect(html).not.toContain('Needs opt-in')
})

test('uses the same conversational framing for the archive view', async () => {
  const html = renderToStaticMarkup(
    await MissingAccountsPage({ searchParams: { view: 'archive' } }),
  )

  expect(html).toContain(
    'These are the opted-in accounts mentioned most often in the Community Archive that haven’t uploaded an archive yet.',
  )
  expect(html).toContain('Opted in, no archive yet')
  expect(html).toContain('No archive yet')
  expect(html).toContain('Most replied to first')
  expect(html).toContain('@tszzl')
  expect(currentTabHref(html)).toEqual(['/missing-accounts?view=archive'])
  expect(html).not.toMatch(/needs? an archive/i)
  expect(html).not.toContain('Needs archive')
})

test('ranks the accounts that reply to members without being in the archive', async () => {
  const html = renderToStaticMarkup(
    await MissingAccountsPage({ searchParams: { view: 'repliers' } }),
  )

  expect(html).toContain(
    'These are the accounts the Community Archive has seen replying to its members most often that haven’t joined yet.',
  )
  expect(html).toContain('Replying most, not a member yet')
  expect(html).toContain('these counts are a minimum')
  expect(html).toContain('Most replies first')
  expect(html).toContain(
    'Accounts ordered by the replies to archive members that the archive has seen',
  )
  expect(html).toContain('@space_punk')
  expect(html).toContain('1,080')
  expect(html).toContain('>replies<')
  expect(html).not.toContain('>posts<')
  expect(currentTabHref(html)).toEqual(['/missing-accounts?view=repliers'])
  expect(html).not.toContain('@deepfates')
  expect(html).not.toContain('Most replied to first')
})

test.each([
  ['an unknown view', 'bogus'],
  ['a differently cased view', 'Repliers'],
  ['an inherited object key', 'constructor'],
  ['a repeated view parameter', ['repliers', 'archive']],
])('falls back to the not-opted-in view for %s', async (_label, view) => {
  const html = renderToStaticMarkup(
    await MissingAccountsPage({ searchParams: { view } }),
  )

  expect(html).toContain('Not opted in yet')
  expect(html).toContain('@deepfates')
  expect(html).not.toContain('@space_punk')
  expect(currentTabHref(html)).toEqual(['/missing-accounts'])
})

test('shows an empty top-repliers view when the gateway predates the ranking', async () => {
  const { topRepliers: _topRepliers, ...data } = response.data
  getMissingAccountsMock.mockResolvedValue({ ...response, data })

  const html = renderToStaticMarkup(
    await MissingAccountsPage({ searchParams: { view: 'repliers' } }),
  )

  expect(html).toContain('No accounts to show yet.')
  expect(html).not.toContain('temporarily unavailable')

  // The other two rankings still come through.
  const optIn = renderToStaticMarkup(
    await MissingAccountsPage({ searchParams: {} }),
  )
  expect(optIn).toContain('@deepfates')
})
