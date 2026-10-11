// ai is ESM-only; tool() only needs to hand back its definition here.
jest.mock('ai', () => ({ tool: (definition: unknown) => definition }))
jest.mock('./toolImpl', () => ({ AGENT_SEARCH_TOOL_EXECUTORS: {} }))

import {
  AGENT_SEARCH_MAX_STEPS,
  agentRunFailure,
  agentSearchPrepareStep,
  finalAnswerText,
} from './agent'

describe('agentSearchPrepareStep', () => {
  test('lets the model call tools until the last allowed step', () => {
    const prepare = agentSearchPrepareStep()
    expect(prepare({ stepNumber: 0 })).toEqual({})
    expect(prepare({ stepNumber: AGENT_SEARCH_MAX_STEPS - 2 })).toEqual({})
  })

  test('forces a written answer on the last allowed step', () => {
    expect(
      agentSearchPrepareStep()({ stepNumber: AGENT_SEARCH_MAX_STEPS - 1 }),
    ).toEqual({ toolChoice: 'none' })
  })

  test('forces a written answer once the run’s deadline has passed', () => {
    let now = 1_000
    const prepare = agentSearchPrepareStep(2_000, () => now)
    expect(prepare({ stepNumber: 3 })).toEqual({})
    now = 2_000
    expect(prepare({ stepNumber: 3 })).toEqual({ toolChoice: 'none' })
  })
})

describe('finalAnswerText', () => {
  test('is the last step’s text, never earlier narration', () => {
    expect(
      finalAnswerText([{ text: 'Let me search more.' }, { text: '' }]),
    ).toBe('')
    expect(finalAnswerText([{ text: 'Searching' }, { text: 'Answer' }])).toBe(
      'Answer',
    )
    expect(finalAnswerText([])).toBe('')
  })
})

describe('agentRunFailure', () => {
  const answered = [{ text: 'Searching' }, { text: 'The answer [[t:1]]' }]

  test('a stopped run with an answer succeeded', () => {
    expect(agentRunFailure({ finishReason: 'stop', steps: answered })).toBe(
      null,
    )
  })

  test('a model stream error is a failure, with its message', () => {
    expect(
      agentRunFailure({
        error: new Error('upstream 500'),
        finishReason: 'stop',
        steps: answered,
      }),
    ).toBe('The model failed: upstream 500')
  })

  test.each([
    ['length', 'cut off'],
    ['content-filter', 'content filter'],
    ['error', 'failed'],
    ['tool-calls', 'step limit'],
    ['other', 'stopped early (other)'],
  ])('finish reason %s is a failure', (finishReason, message) => {
    expect(agentRunFailure({ finishReason, steps: answered })).toContain(
      message,
    )
  })

  test('an empty answer is a failure', () => {
    expect(
      agentRunFailure({ finishReason: 'stop', steps: [{ text: '  ' }] }),
    ).toBe('The model returned no answer')
  })
})
