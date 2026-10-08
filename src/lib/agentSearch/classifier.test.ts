// ai and the providers are ESM-only; scorer selection needs neither.
jest.mock('ai', () => ({}))
jest.mock('./model', () => ({}))

import { agentSearchScorer } from './classifier'

describe('agentSearchScorer', () => {
  test('defaults to Decisions, then Jev, then the LLM, by available key', () => {
    expect(
      agentSearchScorer({
        OPENAI_API_KEY: 'k',
        OPENROUTER_API_KEY: 'k',
      } as NodeJS.ProcessEnv),
    ).toBe('decisions')
    expect(
      agentSearchScorer({ OPENROUTER_API_KEY: 'k' } as NodeJS.ProcessEnv),
    ).toBe('jev')
    expect(agentSearchScorer({} as NodeJS.ProcessEnv)).toBe('llm')
  })

  test('honours AGENT_SEARCH_SCORER only when its key exists', () => {
    expect(
      agentSearchScorer({
        OPENAI_API_KEY: 'k',
        OPENROUTER_API_KEY: 'k',
        AGENT_SEARCH_SCORER: 'jev',
      } as NodeJS.ProcessEnv),
    ).toBe('jev')
    expect(
      agentSearchScorer({
        OPENAI_API_KEY: 'k',
        AGENT_SEARCH_SCORER: 'llm',
      } as NodeJS.ProcessEnv),
    ).toBe('llm')
    expect(
      agentSearchScorer({
        OPENAI_API_KEY: 'k',
        AGENT_SEARCH_SCORER: 'jev',
      } as NodeJS.ProcessEnv),
    ).toBe('decisions')
  })
})
