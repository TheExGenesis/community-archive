import type { Notice } from './types'

/** Jev's fixed topic vocabulary. The final option matches posts with no topic. */
export const JEV_TOPIC_LABELS: Record<string, string> = {
  software: 'Software',
  ai: 'AI',
  design: 'Design',
  research: 'Research',
  writing: 'Writing',
  education: 'Education',
  career: 'Career',
  startup: 'Startups',
  community: 'Community',
  events: 'Events',
  arts: 'Arts',
  health: 'Health',
  climate: 'Climate',
  finance: 'Finance',
  local: 'Local',
  other: 'Other / no topic',
}

export type JevSort = 'value' | 'opportunity' | 'joke'

export type JevFilters = {
  minValue: number
  minOpportunity: number
  maxJoke: number
  topics: string[]
  sortBy: JevSort | null
}

export const DEFAULT_JEV_FILTERS: JevFilters = {
  minValue: 1,
  minOpportunity: 0.9,
  maxJoke: 0.3,
  topics: [],
  sortBy: null,
}

function bounded(raw: string | null, fallback: number, max: number) {
  if (raw === null) return fallback
  if (!/^\d{1,2}(?:\.\d{1,3})?$/.test(raw)) return null
  const value = Number(raw)
  return value <= max ? value : null
}

export function parseJevFilters(params: URLSearchParams): JevFilters | null {
  const minValue = bounded(
    params.get('minValue'),
    DEFAULT_JEV_FILTERS.minValue,
    4,
  )
  const minOpportunity = bounded(
    params.get('minOpportunity'),
    DEFAULT_JEV_FILTERS.minOpportunity,
    1,
  )
  const maxJoke = bounded(params.get('maxJoke'), DEFAULT_JEV_FILTERS.maxJoke, 1)
  const sortBy = params.get('metric') || null
  const rawTopics = params.get('topics') || ''
  const topics = Array.from(
    new Set(rawTopics.split(',').filter(Boolean)),
  ).sort()
  if (
    minValue === null ||
    minOpportunity === null ||
    maxJoke === null ||
    (sortBy !== null && !['value', 'opportunity', 'joke'].includes(sortBy)) ||
    topics.some(
      (topic) => !Object.prototype.hasOwnProperty.call(JEV_TOPIC_LABELS, topic),
    )
  )
    return null
  return {
    minValue,
    minOpportunity,
    maxJoke,
    topics,
    sortBy: sortBy as JevSort | null,
  }
}

export function addJevParams(params: URLSearchParams, filters: JevFilters) {
  if (filters.minValue !== DEFAULT_JEV_FILTERS.minValue)
    params.set('minValue', String(filters.minValue))
  if (filters.minOpportunity !== DEFAULT_JEV_FILTERS.minOpportunity)
    params.set('minOpportunity', String(filters.minOpportunity))
  if (filters.maxJoke !== DEFAULT_JEV_FILTERS.maxJoke)
    params.set('maxJoke', String(filters.maxJoke))
  if (filters.topics.length) params.set('topics', filters.topics.join(','))
  if (filters.sortBy) params.set('metric', filters.sortBy)
  return params
}

export function hasJevFilters(filters: JevFilters) {
  return !!(
    filters.minValue !== DEFAULT_JEV_FILTERS.minValue ||
    filters.minOpportunity !== DEFAULT_JEV_FILTERS.minOpportunity ||
    filters.maxJoke !== DEFAULT_JEV_FILTERS.maxJoke ||
    filters.topics.length ||
    filters.sortBy
  )
}

export function matchesJevFilters(notice: Notice, filters: JevFilters) {
  if (filters.minValue > 0 && (notice.value_score ?? -1) < filters.minValue)
    return false
  if (
    filters.minOpportunity > 0 &&
    (notice.p_opportunity ?? -1) < filters.minOpportunity
  )
    return false
  if (filters.maxJoke < 1 && (notice.p_joke ?? 2) > filters.maxJoke)
    return false
  if (!filters.topics.length) return true
  return filters.topics.some((topic) =>
    topic === 'other' ? !notice.topics.length : notice.topics.includes(topic),
  )
}
