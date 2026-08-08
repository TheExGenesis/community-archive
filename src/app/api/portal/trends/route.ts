import { NextRequest, NextResponse } from 'next/server'
import {
  fetchPortalTrendEvidence,
  fetchPortalTrendSeries,
  portalTrendTokens,
} from '@/lib/portal/analytics'
import { getIsMember } from '@/lib/portal/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_TERMS = 8
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
      return privateJson(await fetchPortalTrendSeries(terms))
    }

    if (view === 'feed') {
      const includeTerms = normalizedTerms(params.getAll('include'))
      const excludeTerms = normalizedTerms(params.getAll('exclude'))
      if (includeTerms.length === 0) {
        throw new Error('Include at least one term to load matching tweets')
      }
      return privateJson({
        tweets: await fetchPortalTrendEvidence(includeTerms, excludeTerms, 30),
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
