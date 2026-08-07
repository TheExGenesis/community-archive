import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'

import MissingAccountsPage, { metadata } from '@/app/missing-accounts/page'
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

test('uses the same plain-language framing in page metadata', () => {
  expect(metadata.description).toBe(
    'See the accounts mentioned most often in the Community Archive that have not opted in or uploaded their archive yet.',
  )
})

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
  expect(html).not.toMatch(/needs? an archive/i)
  expect(html).not.toContain('Needs archive')
})
