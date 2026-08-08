import { NextRequest, NextResponse } from 'next/server'
import { getIsMember } from '@/lib/portal/auth'
import { getPortalBangersPage } from '@/lib/portal/data'
import type { PortalBangersScope, PortalBangersSort } from '@/lib/portal/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
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
  if (!(await getIsMember())) {
    return privateJson({ error: 'Sign in to browse bangers' }, 401)
  }

  try {
    const params = new URL(request.url).searchParams
    const offset = boundedInteger(params.get('offset'), 0, 0, 1_000_000)
    const year = params.has('year')
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

    return privateJson(
      await getPortalBangersPage({
        limit: 60,
        offset,
        scope,
        sort,
        year,
        query,
      }),
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    const isInputError =
      message.startsWith('Invalid') || message === 'Banger search is too long'
    if (!isInputError) console.error('Portal bangers request failed:', error)
    return privateJson(
      {
        error: isInputError
          ? message
          : 'The bangers explorer is temporarily unavailable',
      },
      isInputError ? 400 : 502,
    )
  }
}
