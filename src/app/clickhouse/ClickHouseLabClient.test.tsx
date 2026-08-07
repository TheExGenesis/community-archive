import { act, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import userEvent from '@testing-library/user-event'
import ClickHouseLabClient from './ClickHouseLabClient'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('@/lib/posthog', () => ({
  capturePostHogEvent: jest.fn(),
}))

const timing = {
  wallMs: 1,
  clickhouseMs: 1,
  rowsRead: 1,
  bytesRead: 1,
}

const summary = {
  data: {
    totalAccounts: '1',
    memberAccounts: '1',
    totalTweets: '1',
    totalLikes: '1',
    totalUserMentions: '1',
    topMentionedUsers: [],
    topAccountsByFollowers: [],
    sourceUpdatedAt: '2026-08-07 00:00:00',
    collectedAt: '2026-08-07 00:00:00',
  },
  timing,
}

function quotes(fullText: string) {
  return {
    data: [
      {
        tweetId: '123',
        quoteCount: '1',
        quotingAccounts: '1',
        selfQuotesRemoved: '0',
        accountId: '1',
        username: 'alice',
        displayName: 'Alice',
        createdAt: '2026-08-07 00:00:00',
        fullText,
        favoriteCount: '0',
        retweetCount: '0',
      },
    ],
    query: {
      limit: 25,
      excludeSelf: true,
      targetCommunityUsersOnly: true,
      quoteCommunityUsersOnly: true,
      includeUsernames: [],
      excludeUsernames: [],
      unresolvedIncludeUsernames: [],
      unresolvedExcludeUsernames: [],
      selfQuotesRemoved: '0',
      candidateRankingTruncated: false,
    },
    timing,
  }
}

const evidence = {
  data: [
    {
      tweetId: '456',
      accountId: '2',
      username: 'bob',
      displayName: 'Bob',
      avatarUrl: null,
      createdAt: '2026-08-07 00:00:00',
      fullText: 'Quote evidence',
      favoriteCount: '0',
      retweetCount: '0',
    },
  ],
  query: {
    tweetId: '123',
    limit: 25,
    offset: 0,
    total: '1',
    excludeSelf: true,
    quoteCommunityUsersOnly: true,
    includeUsernames: [],
    excludeUsernames: [],
    unresolvedIncludeUsernames: [],
    unresolvedExcludeUsernames: [],
  },
  timing,
}

function response(body: unknown): Response {
  return { ok: true, json: async () => body } as Response
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

describe('ClickHouseLabClient quote evidence', () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
    Reflect.deleteProperty(globalThis, 'fetch')
  })

  test('does not reuse evidence from an older ranking query', async () => {
    const rankingResponse = deferred<Response>()
    const staleEvidenceResponse = deferred<Response>()
    let rankingRequests = 0
    let evidenceRequests = 0

    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/summary')) return response(summary)
      if (url.includes('/top-quotes?')) {
        rankingRequests += 1
        return rankingRequests === 1
          ? response(quotes('Original target'))
          : rankingResponse.promise
      }
      if (url.includes('/quote-posts/123?')) {
        evidenceRequests += 1
        return evidenceRequests === 1
          ? staleEvidenceResponse.promise
          : response(evidence)
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: fetchMock,
    })

    const user = userEvent.setup()
    render(<ClickHouseLabClient />)

    expect(await screen.findByText('Original target')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show quotes' }))
    await user.click(screen.getByRole('button', { name: 'Rank quotes' }))

    await act(async () => {
      rankingResponse.resolve(response(quotes('Updated target')))
      await rankingResponse.promise
    })
    expect(await screen.findByText('Updated target')).toBeInTheDocument()

    await act(async () => {
      staleEvidenceResponse.resolve(response(evidence))
      await staleEvidenceResponse.promise
    })
    await user.click(screen.getByRole('button', { name: 'Show quotes' }))

    await waitFor(() => expect(evidenceRequests).toBe(2))
  })
})
