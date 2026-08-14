import { NextRequest, NextResponse } from 'next/server'
import {
  fetchPortalTrendEvidence,
  fetchPortalTrendSeries,
  portalTrendTokens,
} from '@/lib/portal/analytics'
import { getIsMember } from '@/lib/portal/auth'
import { enrichPortalTweets } from '@/lib/portal/data'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_TERMS = 12
const MAX_TERM_LENGTH = 80

function normalizedTerms(values: string[]): string[] {
  const terms = Array.from(
    new Set(
      values.map((value) => value.trim().toLocaleLowerCase()).filter(Boolean),
    ),
  )
  if (terms.length > MAX_TERMS) {
    throw new Error(`Choose at most ${MAX_TERMS} terms at a time`)
  }
  if (
    terms.some(
      (term) =>
        term.length > MAX_TERM_LENGTH || portalTrendTokens(term).length === 0,
    )
  ) {
    throw new Error('Enter searchable terms of 80 characters or fewer')
  }
  return terms
}

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

function optionalDate(value: string | null, label: string): string | undefined {
  if (value === null) return undefined
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Choose a valid ${label} date`)
  }
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`Choose a valid ${label} date`)
  }
  return value
}

export async function GET(request: NextRequest) {
  if (!(await getIsMember())) {
    return privateJson({ error: 'Sign in to explore trends' }, 401)
  }

  try {
    const params = new URL(request.url).searchParams
    const view = params.get('view')

    if (view === 'series') {
      const terms = normalizedTerms(params.getAll('q'))
      if (terms.length === 0) throw new Error('Enter at least one term')
      const requestedGranularity = params.get('granularity') ?? 'year'
      if (requestedGranularity !== 'year' && requestedGranularity !== 'month') {
        throw new Error('Choose year or month granularity')
      }
      return privateJson(
        await fetchPortalTrendSeries(
          terms,
          new Date(),
          undefined,
          requestedGranularity,
        ),
      )
    }

    if (view === 'feed') {
      const includeTerms = normalizedTerms(params.getAll('include'))
      if (includeTerms.length === 0) {
        throw new Error('Include at least one term to load matching tweets')
      }
      const since = optionalDate(params.get('since'), 'start')
      const until = optionalDate(params.get('until'), 'end')
      if (since && until && since >= until) {
        throw new Error('Choose an end date after the start date')
      }
      return privateJson({
        tweets: await enrichPortalTweets(
          await fetchPortalTrendEvidence(includeTerms, {
            limit: 30,
            since,
            until,
          }),
        ),
      })
    }

    return privateJson({ error: 'Choose a trends view' }, 400)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request'
    const isInputError =
      message.startsWith('Enter') ||
      message.startsWith('Choose') ||
      message.startsWith('Include')
    if (!isInputError) console.error('Portal trends request failed:', error)
    return privateJson(
      {
        error: isInputError
          ? message
          : 'The trends explorer is temporarily unavailable',
      },
      isInputError ? 400 : 502,
    )
  }
}
