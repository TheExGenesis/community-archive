let inFlight = 0
let maxInFlight = 0
const mockLookup = jest.fn(async (ids: string[], _limits?: unknown) => {
  inFlight++
  maxInFlight = Math.max(maxInFlight, inFlight)
  await new Promise((resolve) => setTimeout(resolve, 5))
  inFlight--
  return ids.map((id) => ({ id, text: `post ${id}`, username: 'u' }))
})
const mockDetails = jest.fn((ids: string[], limits: unknown) =>
  mockLookup(ids, limits),
)
jest.mock('./gateway', () => ({
  getTweetDetails: (ids: string[], limits: unknown) => mockDetails(ids, limits),
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
    mockDetails.mockClear()
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

  test('full cards only for tweets the prose cites; listed tweets use the lookup', async () => {
    const run = runWithTweets('ra', 3)
    const ids = Array.from(
      JSON.stringify(run.parts).matchAll(/"\$t":"(\d+)"/g),
      (m) => m[1],
    )
    const withAnswer = {
      ...run,
      // All three are "cited" on the run (lists count), one in the prose.
      citedTweetIds: ids,
      answer: `Said so [[t:${ids[0]}]]\n[[posts: All | ${ids.join(', ')}]]`,
    } as AgentSearchRun
    await loadConversationTweets([withAnswer])
    expect(mockDetails.mock.calls.flatMap(([batch]) => batch)).toEqual([ids[0]])
    expect(mockLookup.mock.calls.length).toBeGreaterThan(0)
  })

  test('a failed batch leaves its tweets out instead of failing the conversation', async () => {
    mockLookup.mockImplementationOnce(async () => {
      throw new Error('timeout')
    })
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const runs = [runWithTweets('ra', 100), runWithTweets('rb', 100)]
    const tweets = await loadConversationTweets(runs)
    expect(tweets.size).toBe(100)
    warn.mockRestore()
  })
})
