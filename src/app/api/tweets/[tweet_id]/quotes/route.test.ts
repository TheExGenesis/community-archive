/** @jest-environment node */

import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@/utils/supabase'
import { getQuotingTweetsPage } from '@/lib/quotingTweets'
import { GET } from './route'

jest.mock('next/headers', () => ({ cookies: jest.fn() }))
jest.mock('@/utils/supabase', () => ({ createServerClient: jest.fn() }))
jest.mock('@/lib/quotingTweets', () => ({ getQuotingTweetsPage: jest.fn() }))

const createServerClientMock = jest.mocked(createServerClient)
const getQuotingTweetsPageMock = jest.mocked(getQuotingTweetsPage)
const getUser = jest.fn()

describe('tweet quotes route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(cookies as jest.Mock).mockResolvedValue({})
    createServerClientMock.mockReturnValue({
      auth: { getUser },
    } as never)
  })

  test('rejects anonymous requests before loading quotes', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    const response = await GET(
      new NextRequest(
        'https://community-archive.org/api/tweets/123/quotes?offset=0&limit=12',
      ),
      { params: { tweet_id: '123' } },
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Log in to see archived quotes',
    })
    expect(getQuotingTweetsPageMock).not.toHaveBeenCalled()
  })

  test('returns quote pages to authenticated users', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'signed-in-user' } },
      error: null,
    })
    getQuotingTweetsPageMock.mockResolvedValue({
      tweets: [],
      totalCount: 0,
      nextOffset: null,
    })
    const response = await GET(
      new NextRequest(
        'https://community-archive.org/api/tweets/123/quotes?offset=0&limit=12',
      ),
      { params: { tweet_id: '123' } },
    )

    expect(response.status).toBe(200)
    expect(getQuotingTweetsPageMock).toHaveBeenCalledWith('123', 0, 12)
  })
})
