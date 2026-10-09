let inFlight = 0
let maxInFlight = 0
const mockLookup = jest.fn(async (ids: string[], _limits?: unknown) => {
  inFlight++
  maxInFlight = Math.max(maxInFlight, inFlight)
  await new Promise((resolve) => setTimeout(resolve, 5))
  inFlight--
  return ids.map((id) => ({ id, text: `post ${id}`, username: 'u' }))
})
jest.mock('./gateway', () => ({
  getTweetDetails: (ids: string[], limits: unknown) => mockLookup(ids, limits),
  getTweetsByIds: (ids: string[], limits: unknown) => mockLookup(ids, limits),
}))

import { buildRunParts } from './history'
import { loadConversationTweets } from './historyTweets'
import type { AgentSearchRun } from './types'

const runWithTweets = (id: string, count: number): AgentSearchRun =>
  ({
    id,
    accountId: '42',
    citedTweetIds: [],
    parts: buildRunParts(
      [
        {
          toolCalls: [{ toolCallId: id, toolName: 'search_tweets', input: {} }],
          toolResults: [
            {
              toolCallId: id,
              output: {
                tweets: Array.from({ length: count }, (_, i) => ({
                  id: `${id.length}${i}${id.charCodeAt(1)}`,
                  text: 't',
                  username: 'u',
                })),
              },
            },
          ],
        },
      ],
      '',
    ),
  }) as unknown as AgentSearchRun

describe('loadConversationTweets', () => {
  beforeEach(() => {
    inFlight = 0
    maxInFlight = 0
    mockLookup.mockClear()
  })

  test('fetches a long conversation a few batches at a time, within a time budget', async () => {
    const runs = Array.from({ length: 12 }, (_, i) =>
      runWithTweets(`r${String.fromCharCode(97 + i)}`, 100),
    )
    const before = Date.now()
    const tweets = await loadConversationTweets(runs)
    expect(tweets.size).toBe(1200)
    expect(mockLookup).toHaveBeenCalledTimes(12)
    expect(maxInFlight).toBeLessThanOrEqual(4)
    const limits = mockLookup.mock.calls[0][1] as unknown as {
      deadlineAt: number
    }
    expect(limits.deadlineAt).toBeGreaterThanOrEqual(before + 12_000)
    expect(limits.deadlineAt).toBeLessThanOrEqual(Date.now() + 12_000)
  })
})
