// ai is ESM-only; tool() only needs to hand back its definition here.
jest.mock('ai', () => ({ tool: (definition: unknown) => definition }))
jest.mock('./toolImpl', () => ({ AGENT_SEARCH_TOOL_EXECUTORS: {} }))

import {
  AGENT_SEARCH_MAX_STEPS,
  agentRunFailure,
  agentSearchInstructions,
  agentSearchPrepareStep,
  agentSearchPrepareStepOptions,
  agentSearchPromptVariant,
  bashInstructions,
  bashInstructionsV2,
  agentSearchToolMode,
  ARCHIVE_UNAVAILABLE_ERROR,
  createBashAgentTools,
  FINAL_STEP_NOTE,
  finalAnswerText,
  STALL_NOTE,
  stallSteps,
  questionWithWorkspace,
  toolsKeepFailing,
} from './agent'

describe('agentSearchPrepareStep', () => {
  test('the reasoning and stall flags are on unless set to off', () => {
    expect(agentSearchPrepareStepOptions({} as NodeJS.ProcessEnv)).toEqual({
      keepReasoning: true,
      stallReminder: true,
    })
    expect(
      agentSearchPrepareStepOptions({
        AGENT_SEARCH_KEEP_REASONING: 'off',
        AGENT_SEARCH_STALL_REMINDER: 'off',
      } as unknown as NodeJS.ProcessEnv),
    ).toEqual({ keepReasoning: false, stallReminder: false })
  })

  test('the bash prompt is v2 with examples unless another is chosen', () => {
    expect(agentSearchPromptVariant(undefined)).toBe('v2-examples')
    expect(agentSearchPromptVariant('v1')).toBe('v1')
    expect(agentSearchPromptVariant('v2')).toBe('v2')
  })

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
    // Already there: the messages are left as they are.
    expect(again.messages).toBeUndefined()
  })
})

describe('the conversation each step sees', () => {
  const tweetRow = (id: string) => ({ id, text: `tweet ${id}` })
  const step = (
    callId: string,
    command: string,
    ids: string[],
    reasoningText?: string,
  ) => ({
    reasoningText,
    toolCalls: [{ toolCallId: callId, input: { command } }],
    toolResults: [
      { toolCallId: callId, output: { tweets: ids.map(tweetRow) } },
    ],
  })
  const turn = (callId: string) => [
    {
      role: 'assistant',
      content: [{ type: 'tool-call', toolCallId: callId, toolName: 'bash' }],
    },
    {
      role: 'tool',
      content: [{ type: 'tool-result', toolCallId: callId, toolName: 'bash' }],
    },
  ]
  const question = { role: 'user', content: [{ type: 'text', text: 'Q?' }] }

  test('each tool call carries the reasoning that led to it', () => {
    const prepare = agentSearchPrepareStep(undefined, undefined, {
      keepReasoning: true,
    })
    const messages = [question, ...turn('c1')]
    const steps = [step('c1', 'search a', ['1'], 'Look for a first.')]
    const result = prepare({ stepNumber: 1, messages, steps })
    expect(result.messages?.[1].content).toEqual([
      { type: 'reasoning', text: 'Look for a first.' },
      { type: 'tool-call', toolCallId: 'c1', toolName: 'bash' },
    ])
    // Kept by the workflow and seen again: nothing more to change.
    expect(
      prepare({ stepNumber: 2, messages: result.messages, steps }).messages,
    ).toBeUndefined()
  })

  test('a reminder follows the third command in a row that found nothing new', () => {
    const steps = [
      step('c1', 'search a', ['1', '2']),
      step('c2', 'search b', ['2']),
      step('c3', 'search c', []),
      step('c4', 'search d', ['1']),
    ]
    expect(stallSteps(steps)).toEqual([3])
    const messages = [
      question,
      ...steps.flatMap((s) => turn(s.toolCalls[0].toolCallId)),
    ]
    const prepare = agentSearchPrepareStep(undefined, undefined, {
      stallReminder: true,
    })
    const result = prepare({ stepNumber: 4, messages, steps })
    const texts = result.messages!.map((m) => JSON.stringify(m.content))
    expect(texts[texts.length - 1]).toContain(STALL_NOTE)
    // Rebuilt the same way on the next step, never twice.
    const again = prepare({ stepNumber: 5, messages: result.messages, steps })
    expect(again.messages).toBeUndefined()
  })

  test('both are off by default, so production is unchanged', () => {
    const steps = [
      step('c1', 'search a', ['1'], 'Look for a first.'),
      step('c2', 'search a', ['1']),
    ]
    const messages = [question, ...turn('c1'), ...turn('c2')]
    expect(
      agentSearchPrepareStep(
        undefined,
        undefined,
        {},
      )({
        stepNumber: 2,
        messages,
        steps,
      }),
    ).toEqual({})
  })

  test('a repeated command is a stall; new tweets are not', () => {
    expect(
      stallSteps([
        step('c1', 'search a', ['1']),
        step('c2', 'search b', ['2']),
        step('c3', 'search a', ['3']),
      ]),
    ).toEqual([2])
    expect(
      stallSteps([
        step('c1', 'search a', ['1']),
        step('c2', 'search b', ['2']),
        step('c3', 'search c', ['3']),
      ]),
    ).toEqual([])
  })
})

describe('the v2 instructions', () => {
  test('replace how to work, keep the answer rules, and drop examples unless asked', () => {
    const v1 = bashInstructions('2026-10-14')
    const v2 = bashInstructionsV2('2026-10-14')
    const withExamples = bashInstructionsV2('2026-10-14', true)
    expect(v2).not.toContain('How to work:')
    expect(v2).toContain('Working:')
    expect(v2).toContain('Not finding a statement is not evidence')
    expect(v2).not.toContain('Examples (commands shortened):')
    expect(withExamples).toContain('Examples (commands shortened):')
    const answerRules = v1.slice(
      v1.indexOf('How to answer:'),
      v1.indexOf('Examples (commands shortened):'),
    )
    expect(v2).toContain(answerRules.trimEnd())
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
