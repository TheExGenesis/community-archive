import { generateValidated } from '../../../services/nightly-digest/publish'
import { generateDigestWithModel, DIGEST_JSON_SCHEMA } from './openai'
import { assembleDigestEditionContent } from './generation'
import type { DigestPromptVersion } from './types'

jest.mock('./openai', () => ({
  ...jest.requireActual('./openai'),
  generateDigestWithModel: jest.fn(),
}))
jest.mock('./generation', () => ({
  ...jest.requireActual('./generation'),
  assembleDigestEditionContent: jest.fn(),
}))

const generate = jest.mocked(generateDigestWithModel)
const assemble = jest.mocked(assembleDigestEditionContent)
const input = {
  runId: 'test-run',
  digestDate: '2026-09-27',
  windowStart: '2026-09-26T06:00:00.000Z',
  windowEnd: '2026-09-27T06:00:00.000Z',
  candidates: [],
  renderedPrompt: 'Frozen corpus',
  prompt: {
    model: 'anthropic/claude-opus-5.5',
    systemPrompt: 'Editor',
    parameters: {},
  } as DigestPromptVersion,
}

beforeEach(() => {
  jest.clearAllMocks()
})

test('persists both rejected attempts and sends actionable repair constraints without unbounded retries', async () => {
  generate.mockResolvedValue({
    response: { id: 'response-1' },
    output: { stories: [] },
    outputError: null,
    responseId: 'response-1',
    model: input.prompt.model,
    inputTokens: 10,
    outputTokens: 10,
    totalTokens: 20,
  })
  assemble.mockImplementation(() => {
    throw new Error(
      'Story 3 is incomplete: bullets must contain 1–3 non-empty strings, each at most 220 characters',
    )
  })
  const onAttempt = jest.fn(async () => {})
  await expect(generateValidated({ ...input, onAttempt })).rejects.toThrow(
    '220 characters',
  )
  expect(generate).toHaveBeenCalledTimes(2)
  expect(onAttempt).toHaveBeenCalledTimes(2)
  const repair = generate.mock.calls[1][0].userPrompt
  expect(repair).toContain('220 characters')
  expect(repair).toContain(JSON.stringify(DIGEST_JSON_SCHEMA))
  expect(repair).toContain('never truncate')
})

test('does not spend another request after validation succeeds', async () => {
  assemble.mockReturnValue({ stories: [] } as never)
  const result = await generateValidated(input)
  expect(result.attempts).toHaveLength(1)
  expect(generate).toHaveBeenCalledTimes(1)
})
