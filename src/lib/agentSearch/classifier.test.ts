// ai and the providers are ESM-only; scorer selection needs neither.
jest.mock('ai', () => ({}))
jest.mock('./model', () => ({}))

import { agentSearchScorer } from './classifier'

const env = (vars: Record<string, string>) =>
  vars as unknown as NodeJS.ProcessEnv

describe('agentSearchScorer', () => {
  test('defaults to Decisions, then Jev, then the LLM, by available key', () => {
    expect(
      agentSearchScorer(
        env({
          OPENAI_API_KEY: 'k',
          OPENROUTER_API_KEY: 'k',
        }),
      ),
    ).toBe('decisions')
    expect(agentSearchScorer(env({ OPENROUTER_API_KEY: 'k' }))).toBe('jev')
    expect(agentSearchScorer(env({}))).toBe('llm')
  })

  test('honours AGENT_SEARCH_SCORER only when its key exists', () => {
    expect(
      agentSearchScorer(
        env({
          OPENAI_API_KEY: 'k',
          OPENROUTER_API_KEY: 'k',
          AGENT_SEARCH_SCORER: 'jev',
        }),
      ),
    ).toBe('jev')
    expect(
      agentSearchScorer(
        env({
          OPENAI_API_KEY: 'k',
          AGENT_SEARCH_SCORER: 'llm',
        }),
      ),
    ).toBe('llm')
    expect(
      agentSearchScorer(
        env({
          OPENAI_API_KEY: 'k',
          AGENT_SEARCH_SCORER: 'jev',
        }),
      ),
    ).toBe('decisions')
  })
})
