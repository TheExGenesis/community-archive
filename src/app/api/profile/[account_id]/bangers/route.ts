import { NextRequest, NextResponse } from 'next/server'
import {
  PROFILE_BANGERS_PAGE_LIMIT,
  type ProfileBangerSort,
} from '@/lib/metaTwitter/bangers'
import { getCuratedProfileBangersPage } from '@/lib/profileCuration'
import { enforceBotId } from '@/lib/botIdServer'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ACCOUNT_ID_PATTERN = /^\d{1,20}$/

const boundedInteger = (
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number,
) => {
  if (value === null) return fallback
  if (!/^\d+$/.test(value)) throw new Error('Invalid profile pagination')
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error('Invalid profile pagination')
  }
  return parsed
}

const profileJson = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
    },
  })

export async function GET(
  request: NextRequest,
  { params }: { params: { account_id: string } },
) {
  const botResponse = await enforceBotId()
  if (botResponse) return botResponse

  try {
    if (!ACCOUNT_ID_PATTERN.test(params.account_id)) {
      throw new Error('Invalid profile account')
    }
    const search = request.nextUrl.searchParams
    const limit = boundedInteger(
      search.get('limit'),
      PROFILE_BANGERS_PAGE_LIMIT,
      1,
      PROFILE_BANGERS_PAGE_LIMIT,
    )
    const offset = boundedInteger(search.get('offset'), 0, 0, 1_000_000)
    const year = search.has('year')
      ? boundedInteger(
          search.get('year'),
          new Date().getUTCFullYear(),
          2006,
          new Date().getUTCFullYear() + 1,
        )
      : undefined
    const sortValue = search.get('sort')
    if (
      sortValue !== null &&
      sortValue !== 'quotes' &&
      sortValue !== 'likes' &&
      sortValue !== 'newest'
    ) {
      throw new Error('Invalid profile sort')
    }
    const sort: ProfileBangerSort =
      sortValue === 'likes' || sortValue === 'newest' ? sortValue : 'quotes'

    const page = await getCuratedProfileBangersPage(params.account_id, {
      limit,
      offset,
      year,
      sort,
    })
    if (!page.available) {
      return profileJson(
        { error: 'Profile bangers are temporarily unavailable' },
        502,
      )
    }
    return profileJson(page)
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    const isInputError = message.startsWith('Invalid profile')
    if (!isInputError) console.error('Profile bangers request failed:', error)
    return profileJson(
      {
        error: isInputError
          ? message
          : 'Profile bangers are temporarily unavailable',
      },
      isInputError ? 400 : 502,
    )
  }
}
