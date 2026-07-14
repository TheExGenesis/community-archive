export const SEARCH_FILTER_KEYS = ['from', 'to', 'since', 'until'] as const

export type SearchFilterKey = (typeof SEARCH_FILTER_KEYS)[number]

export type SearchFilters = Partial<Record<SearchFilterKey, string>>

export interface ParsedSearchExpression {
  options: SearchFilters
  words: string[]
}

export function parseSearchExpression(input: string): ParsedSearchExpression {
  const options: SearchFilters = {}
  const words: string[] = []

  input
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .forEach((part) => {
      const separatorIndex = part.indexOf(':')

      if (separatorIndex > 0) {
        const key = part.substring(0, separatorIndex) as SearchFilterKey
        const value = part.substring(separatorIndex + 1)

        if (SEARCH_FILTER_KEYS.includes(key) && value) {
          options[key] = value
          return
        }
      }

      words.push(part)
    })

  return { options, words }
}

export function buildSearchParams(expression: string): URLSearchParams {
  const { options, words } = parseSearchExpression(expression)
  const params = new URLSearchParams()
  const mainQuery = words.join(' ').trim()

  if (mainQuery) params.set('q', mainQuery)
  if (options.from) params.set('fromUser', options.from)
  if (options.to) params.set('replyToUser', options.to)
  if (options.since) params.set('sinceDate', options.since)
  if (options.until) params.set('untilDate', options.until)

  return params
}

export function buildSearchExpression(searchParams: URLSearchParams): string {
  const parts = [searchParams.get('q') || '']
  const fromUser = searchParams.get('fromUser')
  const replyToUser = searchParams.get('replyToUser')
  const sinceDate = searchParams.get('sinceDate')
  const untilDate = searchParams.get('untilDate')

  if (fromUser) parts.push(`from:${fromUser}`)
  if (replyToUser) parts.push(`to:${replyToUser}`)
  if (sinceDate) parts.push(`since:${sinceDate}`)
  if (untilDate) parts.push(`until:${untilDate}`)

  return parts.filter(Boolean).join(' ').trim()
}
