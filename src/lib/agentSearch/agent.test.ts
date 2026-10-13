// ai is ESM-only; tool() only needs to hand back its definition here.
jest.mock('ai', () => ({ tool: (definition: unknown) => definition }))
jest.mock('./toolImpl', () => ({ AGENT_SEARCH_TOOL_EXECUTORS: {} }))

import {
  AGENT_SEARCH_MAX_STEPS,
  agentRunFailure,
  agentSearchInstructions,
  agentSearchPrepareStep,
  agentSearchToolMode,
  ARCHIVE_UNAVAILABLE_ERROR,
  createBashAgentTools,
  FINAL_STEP_NOTE,
  finalAnswerText,
  questionWithWorkspace,
  toolsKeepFailing,
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

  test('tells the model to answer, once, since some models ignore toolChoice', () => {
    const prepare = agentSearchPrepareStep()
    const messages = [{ role: 'user', content: [{ type: 'text', text: 'Q?' }] }]
    expect(prepare({ stepNumber: 0, messages })).toEqual({})
    const forced = prepare({ stepNumber: AGENT_SEARCH_MAX_STEPS - 1, messages })
    expect(forced.toolChoice).toBe('none')
    expect(forced.messages).toEqual([
      ...messages,
      { role: 'user', content: [{ type: 'text', text: FINAL_STEP_NOTE }] },
    ])
    const again = prepare({
      stepNumber: AGENT_SEARCH_MAX_STEPS,
      messages: forced.messages,
    })
    expect(again.messages).toHaveLength(2)
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

  test('cuts tool-call markup a model wrote as text', () => {
    expect(
      finalAnswerText([
        { text: '\n\n<｜DSML｜ calls>\n<｜DSML｜ invoke name="bash">' },
      ]),
    ).toBe('')
    expect(
      finalAnswerText([{ text: 'Partial answer.\n<｜DSML｜ calls>' }]),
    ).toBe('Partial answer.')
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

describe('toolsKeepFailing', () => {
  const failed = { content: [{ type: 'tool-call' }, { type: 'tool-error' }] }
  const mixed = { content: [{ type: 'tool-error' }, { type: 'tool-result' }] }
  const answer = { text: 'An answer', content: [{ type: 'text' }] }

  test('stops after two steps in which every tool call failed', () => {
    expect(toolsKeepFailing({ steps: [failed] })).toBe(false)
    expect(toolsKeepFailing({ steps: [failed, mixed] })).toBe(false)
    expect(toolsKeepFailing({ steps: [mixed, failed, failed] })).toBe(true)
  })

  test('reports the archive as unavailable, not as a step limit', () => {
    expect(
      agentRunFailure({ finishReason: 'tool-calls', steps: [failed, failed] }),
    ).toBe(ARCHIVE_UNAVAILABLE_ERROR)
    expect(
      agentRunFailure({ finishReason: 'stop', steps: [answer] }),
    ).toBeNull()
  })
})

describe('tool modes', () => {
  test('the shell is the default; typed tools only when asked for', () => {
    expect(agentSearchToolMode(undefined)).toBe('bash')
    expect(agentSearchToolMode('')).toBe('bash')
    expect(agentSearchToolMode(' typed ')).toBe('typed')
    expect(agentSearchToolMode('other')).toBe('bash')
  })

  test('each mode has its own instructions, both with semantic search', () => {
    const bash = agentSearchInstructions('2026-10-13', 'bash')
    const typed = agentSearchInstructions('2026-10-13', 'typed')
    expect(bash).toContain('Today is 2026-10-13')
    expect(bash).toContain('[[posts:')
    expect(bash).toContain('semantic')
    expect(typed).toContain('semantic_search')
    expect(typed).not.toContain('[[posts:')
  })

  test('one bash tool whose model output is capped stdout and the exit code', () => {
    const { bash } = createBashAgentTools() as Record<string, any>
    expect(bash.inputSchema.safeParse({ command: 'ls' }).success).toBe(true)
    expect(bash.inputSchema.safeParse({ command: '' }).success).toBe(false)
    const out = bash.toModelOutput({
      output: {
        stdout: 'x\n'.repeat(5000),
        stderr: '',
        exitCode: 0,
        summary: '',
        files: {},
        tweets: [{ id: '1', text: 'not for the model' }],
      },
    })
    expect(out.type).toBe('json')
    expect(Object.keys(out.value)).toEqual(['output', 'exitCode'])
    expect(out.value.output.length).toBeLessThan(4200)
    expect(out.value.output).toContain('more lines not shown')
  })

  test('follow-ups list the files earlier questions left', () => {
    expect(questionWithWorkspace('Q?', [])).toBe('Q?')
    expect(questionWithWorkspace('Q?', ['s1.jsonl · 3 tweets'])).toBe(
      'Q?\n\n(Files in /work from earlier questions: s1.jsonl · 3 tweets)',
    )
  })
})
