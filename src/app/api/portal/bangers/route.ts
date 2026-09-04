import { NextRequest, NextResponse } from 'next/server'
import {
  getPortalBangersPage,
  PORTAL_BANGERS_PAGE_SIZE,
} from '@/lib/portal/data'
import type {
  PortalBangersPeriod,
  PortalBangersScope,
  PortalBangersSort,
} from '@/lib/portal/types'
import { enforceBotId } from '@/lib/botIdServer'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function publicJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control':
        status === 200
          ? 'public, s-maxage=60, stale-while-revalidate=300'
          : 'private, no-store',
    },
  })
}

function boundedInteger(
  value: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === null) return fallback
  if (!/^\d+$/.test(value)) throw new Error('Invalid bangers pagination')
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error('Invalid bangers pagination')
  }
  return parsed
}

export async function GET(request: NextRequest) {
  const botResponse = await enforceBotId()
  if (botResponse) return botResponse

  try {
    const params = new URL(request.url).searchParams
    const offset = boundedInteger(params.get('offset'), 0, 0, 1_000_000)
    const periodValue = params.get('period')
    if (
      periodValue &&
      periodValue !== 'all' &&
      periodValue !== 'today' &&
      periodValue !== 'week' &&
      periodValue !== 'three-months'
    ) {
      throw new Error('Invalid bangers period')
    }
    const period: PortalBangersPeriod | undefined =
      periodValue === 'today' ||
      periodValue === 'week' ||
      periodValue === 'three-months'
        ? periodValue
        : undefined
    const year =
      !period && params.has('year')
        ? boundedInteger(
            params.get('year'),
            new Date().getUTCFullYear(),
            2006,
            new Date().getUTCFullYear() + 1,
          )
        : undefined
    const scope: PortalBangersScope =
      params.get('scope') === 'members' ? 'members' : 'all'
    const sort: PortalBangersSort =
      params.get('sort') === 'recent' ? 'recent' : 'quotes'
    const query = (params.get('q') || '').trim()
    if (query.length > 120) throw new Error('Banger search is too long')

    return publicJson(
      await getPortalBangersPage({
        limit: PORTAL_BANGERS_PAGE_SIZE,
        offset,
        scope,
        sort,
        year,
        period,
        query,
      }),
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    const isInputError =
      message.startsWith('Invalid') || message === 'Banger search is too long'
    if (!isInputError) console.error('Portal bangers request failed:', error)
    return publicJson(
      {
        error: isInputError
          ? message
          : 'The bangers explorer is temporarily unavailable',
      },
      isInputError ? 400 : 502,
    )
  }
}
