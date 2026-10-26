import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { POST } from '@/app/api/tweets/[tweet_id]/summary/route'
import { browsingAuthError } from '@/lib/browsingAuth'
import { loadTweetPage } from '@/lib/tweetSummary/loadTweetPage'
import { getTweetPageSummary } from '@/lib/tweetSummary/store'

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('@/lib/browsingAuth', () => ({ browsingAuthError: jest.fn() }))
jest.mock('@/lib/tweetSummary/loadTweetPage', () => ({
  loadTweetPage: jest.fn(),
}))
jest.mock('@/lib/tweetSummary/store', () => ({
  getTweetPageSummary: jest.fn(),
}))

const subject = { kind: 'tweet', tweets: [] }
const post = (tweetId = '123') =>
  POST(new Request('https://archive.test'), { params: { tweet_id: tweetId } })

beforeEach(() => {
  jest.clearAllMocks()
  ;(browsingAuthError as jest.Mock).mockResolvedValue(null)
})

test('signed-out visitors are refused before anything is read', async () => {
  const denied = NextResponse.json({ error: 'nope' }, { status: 401 })
  ;(browsingAuthError as jest.Mock).mockResolvedValue(denied)
  expect(await post()).toBe(denied)
  expect(loadTweetPage).not.toHaveBeenCalled()
})

test('rejects ids that are not tweet ids', async () => {
  expect((await post('../etc')).status).toBe(400)
  expect(loadTweetPage).not.toHaveBeenCalled()
})

test('generates a missing summary and refreshes the cached page', async () => {
  ;(loadTweetPage as jest.Mock).mockResolvedValue({
    subject,
    summary: null,
    summaryMissing: true,
  })
  const summary = { title: 'A title', description: 'A description' }
  ;(getTweetPageSummary as jest.Mock).mockResolvedValue(summary)

  const response = await post('123')
  expect(await response.json()).toEqual({ summary })
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(getTweetPageSummary).toHaveBeenCalledWith(subject, true)
  expect(revalidatePath).toHaveBeenCalledWith('/tweets/123')
})

test('returns a stored summary without generating or refreshing', async () => {
  const summary = { title: 'Stored', description: 'Already there' }
  ;(loadTweetPage as jest.Mock).mockResolvedValue({
    subject,
    summary,
    summaryMissing: false,
  })

  expect(await (await post()).json()).toEqual({ summary })
  expect(getTweetPageSummary).not.toHaveBeenCalled()
  expect(revalidatePath).not.toHaveBeenCalled()
})

test('an unknown tweet is a 404', async () => {
  ;(loadTweetPage as jest.Mock).mockResolvedValue(null)
  expect((await post()).status).toBe(404)
  expect(getTweetPageSummary).not.toHaveBeenCalled()
})
