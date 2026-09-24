import {
  addJevParams,
  DEFAULT_JEV_FILTERS,
  matchesJevFilters,
  parseJevFilters,
} from './curation'
import type { Notice } from './types'

const notice = {
  value_score: 2.5,
  p_opportunity: 0.91,
  p_joke: 0.12,
  topics: ['arts', 'local'],
} as Notice

test('parses bounded Jev controls and round trips URL settings', () => {
  const selected = {
    minValue: 2.2,
    minOpportunity: 0.85,
    maxJoke: 0.2,
    topics: ['arts', 'local'],
    sortBy: 'value' as const,
  }
  expect(
    parseJevFilters(addJevParams(new URLSearchParams(), selected)),
  ).toEqual(selected)
  expect(parseJevFilters(new URLSearchParams())).toEqual(DEFAULT_JEV_FILTERS)
  for (const query of [
    'minValue=5',
    'minOpportunity=-1',
    'maxJoke=NaN',
    'topics=toString',
    'metric=unknown',
  ])
    expect(parseJevFilters(new URLSearchParams(query))).toBeNull()
})

test('thresholds and selected tags narrow notices without fabricating missing scores', () => {
  expect(matchesJevFilters(notice, DEFAULT_JEV_FILTERS)).toBe(true)
  expect(
    matchesJevFilters(notice, { ...DEFAULT_JEV_FILTERS, minValue: 3 }),
  ).toBe(false)
  expect(
    matchesJevFilters(notice, { ...DEFAULT_JEV_FILTERS, minOpportunity: 0.95 }),
  ).toBe(false)
  expect(
    matchesJevFilters(notice, { ...DEFAULT_JEV_FILTERS, maxJoke: 0.1 }),
  ).toBe(false)
  expect(
    matchesJevFilters(notice, {
      ...DEFAULT_JEV_FILTERS,
      topics: ['arts', 'ai'],
    }),
  ).toBe(true)
  expect(
    matchesJevFilters(notice, { ...DEFAULT_JEV_FILTERS, topics: ['ai'] }),
  ).toBe(false)
  expect(
    matchesJevFilters(
      { ...notice, topics: [] },
      { ...DEFAULT_JEV_FILTERS, topics: ['other'] },
    ),
  ).toBe(true)
  expect(
    matchesJevFilters(
      { ...notice, value_score: null },
      { ...DEFAULT_JEV_FILTERS, minValue: 1 },
    ),
  ).toBe(false)
})
