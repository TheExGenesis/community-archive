import { buildSearchParams } from '@/lib/searchParams'

// Handing an archive search to Ask the archive. The search's query and
// filters travel as the same URL parameters search uses; the Ask page reads
// them once, puts the query in its box and shows the filters as chips that
// are added to the question when it is sent. Nothing is asked automatically:
// a question spends one of the member's daily questions.

export type AskFilterKey = 'from' | 'to' | 'since' | 'until'

export interface AskFilter {
  key: AskFilterKey
  value: string
}

export interface AskPrefill {
  text: string
  filters: AskFilter[]
}

/** The parameters the Ask page reads, as archive search writes them. */
export const ASK_PREFILL_PARAMS = [
  'q',
  'fromUser',
  'replyToUser',
  'sinceDate',
  'untilDate',
] as const

const PARAM_FILTERS: Array<
  [(typeof ASK_PREFILL_PARAMS)[number], AskFilterKey]
> = [
  ['fromUser', 'from'],
  ['replyToUser', 'to'],
  ['sinceDate', 'since'],
  ['untilDate', 'until'],
]

const USERNAME = /^@?(\w{1,30})$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const MAX_TEXT = 1000

/** /search/ask carrying a search expression's query and filters. */
export function buildAskHref(expression: string): string {
  const query = buildSearchParams(expression).toString()
  return query ? `/search/ask?${query}` : '/search/ask'
}

type ParamSource = Partial<
  Record<(typeof ASK_PREFILL_PARAMS)[number], string | string[] | undefined>
>

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? ''

/** What the Ask page should prefill from a search handed to it, if anything. */
export function askPrefillFrom(params: ParamSource): AskPrefill | null {
  const text = first(params.q).slice(0, MAX_TEXT)
  const filters: AskFilter[] = []
  for (const [param, key] of PARAM_FILTERS) {
    const raw = first(params[param])
    if (!raw) continue
    if (key === 'from' || key === 'to') {
      const match = USERNAME.exec(raw)
      if (match) filters.push({ key, value: match[1] })
    } else if (DATE.test(raw) && Number.isFinite(Date.parse(raw))) {
      filters.push({ key, value: raw })
    }
  }
  return text || filters.length ? { text, filters } : null
}

const dayFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

/** A chip's words: "From @visakanv", "Since 1 Jan 2025". */
export function askFilterLabel(filter: AskFilter): string {
  switch (filter.key) {
    case 'from':
      return `From @${filter.value}`
    case 'to':
      return `Replying to @${filter.value}`
    case 'since':
      return `Since ${dayFormat.format(new Date(filter.value))}`
    case 'until':
      return `Until ${dayFormat.format(new Date(filter.value))}`
  }
}

const filterPhrase = (filter: AskFilter) => {
  switch (filter.key) {
    case 'from':
      return `from @${filter.value}`
    case 'to':
      return `replying to @${filter.value}`
    case 'since':
      return `since ${filter.value}`
    case 'until':
      return `until ${filter.value}`
  }
}

/** The question as sent: "singapore (from @visakanv, since 2025-01-01)". */
export function questionWithFilters(text: string, filters: AskFilter[]) {
  const question = text.trim()
  if (!filters.length) return question
  return `${question} (${filters.map(filterPhrase).join(', ')})`
}

/** Whether a key press is the "ask instead" shortcut: ⌘↵ or Ctrl↵. */
export const isAskShortcut = (event: {
  key: string
  metaKey: boolean
  ctrlKey: boolean
}) => event.key === 'Enter' && (event.metaKey || event.ctrlKey)

/**
 * The Ask page's own path with the parameters it reads (the conversation
 * and a search handed over), for returning to it after signing in.
 */
export function askReturnPath(
  searchParams: ParamSource & { c?: string | string[] } = {},
) {
  const params = new URLSearchParams()
  for (const key of ['c', ...ASK_PREFILL_PARAMS] as const) {
    const value = first(searchParams[key])
    if (value) params.set(key, value)
  }
  const query = params.toString()
  return query ? `/search/ask?${query}` : '/search/ask'
}
