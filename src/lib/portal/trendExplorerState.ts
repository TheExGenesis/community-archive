import type { TrendGranularity } from './types'

export type TrendScale = 'raw' | 'normalized'

export interface TrendRange {
  start: string
  end: string
}

export interface TrendExplorerUrlState {
  terms: string[]
  shown: string[]
  included: string[]
  scale: TrendScale
  granularity: TrendGranularity
  range: TrendRange | null
}

const MAX_TERMS = 12
const MAX_TERM_LENGTH = 80

function uniqueTerms(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim().toLocaleLowerCase())
        .filter((value) => value.length > 0 && value.length <= MAX_TERM_LENGTH),
    ),
  ).slice(0, MAX_TERMS)
}

function bucketPattern(granularity: TrendGranularity): RegExp {
  return granularity === 'month' ? /^\d{4}-(0[1-9]|1[0-2])$/ : /^\d{4}$/
}

function selectedTerms(values: string[], terms: string[]): string[] {
  const allowed = new Set(terms)
  return uniqueTerms(values).filter((term) => allowed.has(term))
}

export function defaultTrendExplorerState(
  defaultTerms: string[],
): TrendExplorerUrlState {
  const terms = uniqueTerms(defaultTerms)
  return {
    terms,
    shown: terms.slice(0, 4),
    included: terms.slice(0, 1),
    scale: 'normalized',
    granularity: 'year',
    range: null,
  }
}

export function parseTrendExplorerState(
  search: string,
  defaultTerms: string[],
): TrendExplorerUrlState {
  const params = new URLSearchParams(search)
  const defaults = defaultTrendExplorerState(defaultTerms)
  const terms = uniqueTerms(params.getAll('q'))
  const resolvedTerms = terms.length > 0 ? terms : defaults.terms
  const shownParams = params.getAll('show')
  const includedParams = params.getAll('include')
  const granularity: TrendGranularity =
    params.get('granularity') === 'month' ? 'month' : 'year'
  const from = params.get('from')
  const to = params.get('to')
  const validRange =
    from !== null &&
    to !== null &&
    bucketPattern(granularity).test(from) &&
    bucketPattern(granularity).test(to) &&
    from <= to

  return {
    terms: resolvedTerms,
    shown:
      shownParams.length > 0
        ? selectedTerms(shownParams, resolvedTerms)
        : resolvedTerms.slice(0, 4),
    included:
      includedParams.length > 0
        ? selectedTerms(includedParams, resolvedTerms)
        : resolvedTerms.slice(0, 1),
    scale: params.get('scale') === 'raw' ? 'raw' : 'normalized',
    granularity,
    range: validRange ? { start: from, end: to } : null,
  }
}

export function serializeTrendExplorerState(
  state: TrendExplorerUrlState,
): string {
  const params = new URLSearchParams()
  state.terms.forEach((term) => params.append('q', term))
  state.shown.forEach((term) => params.append('show', term))
  state.included.forEach((term) => params.append('include', term))
  params.set('scale', state.scale)
  params.set('granularity', state.granularity)
  if (state.range) {
    params.set('from', state.range.start)
    params.set('to', state.range.end)
  }
  return params.toString()
}

export function clampTrendRange(
  range: TrendRange | null,
  buckets: string[],
): TrendRange | null {
  if (!range || buckets.length === 0) return null
  const first = buckets[0]
  const last = buckets.at(-1) ?? first
  const start =
    range.start < first ? first : range.start > last ? last : range.start
  const end = range.end > last ? last : range.end < first ? first : range.end
  return start <= end ? { start, end } : { start: end, end: start }
}
