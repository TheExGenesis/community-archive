import {
  AGENT_SEARCH_PROFILES,
  DEFAULT_AGENT_SEARCH_DEPTH,
  LEGACY_AGENT_SEARCH_DEPTH,
  parseAgentSearchDepth,
} from './depth'

test('a new question is fast; a run with no depth on record was deep', () => {
  expect(DEFAULT_AGENT_SEARCH_DEPTH).toBe('fast')
  expect(LEGACY_AGENT_SEARCH_DEPTH).toBe('deep')
})

test('deep keeps what every run had before depths; fast is lighter on each count', () => {
  expect(AGENT_SEARCH_PROFILES.deep).toEqual({
    reasoningEffort: null,
    maxSteps: 20,
    maxSemanticCalls: 6,
  })
  expect(AGENT_SEARCH_PROFILES.fast).toEqual({
    reasoningEffort: 'low',
    maxSteps: 8,
    maxSemanticCalls: 2,
  })
})

test('parses fast and deep, and nothing else', () => {
  expect(parseAgentSearchDepth('fast')).toBe('fast')
  expect(parseAgentSearchDepth('deep')).toBe('deep')
  for (const value of ['Fast', 'deeper', '', null, undefined, 1, {}]) {
    expect(parseAgentSearchDepth(value)).toBeNull()
  }
})
