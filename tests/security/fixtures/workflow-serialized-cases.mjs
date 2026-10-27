// Synthetic persisted records only; never inspect a developer's .workflow-data.
export const now = '2026-10-27T00:00:00.000Z'
export const runId = 'wrun_01K91ZQM000000000000000001'
export const baseRun = {
  runId,
  deploymentId: 'dpl_fixture',
  workflowName: 'workflow//fixture',
  status: 'completed',
  createdAt: now,
  updatedAt: now,
  completedAt: now,
}

// Legacy SerializedDataSchema includes z.any(): null and non-binary values
// are accepted by design, even with specVersion 2. Do not tighten that here.
export const serializedValues = [
  ['absent', {}],
  ['undefined', { value: undefined }],
  ['null', { value: null }],
  ['binary', { value: new Uint8Array([1, 2, 3]) }],
  ['legacy', { value: { result: ['fixture', 3] } }],
  ['non-binary', { value: 42 }],
]

export function serializedFieldCases() {
  const cases = []
  for (const specVersion of [1, 2]) {
    for (const [valueName, entry] of serializedValues) {
      const field = (name) =>
        Object.hasOwn(entry, 'value') ? { [name]: entry.value } : {}
      cases.push({
        name: `completed.output/v${specVersion}/${valueName}`,
        schema: 'WorkflowRunSchema',
        field: 'output',
        valueName,
        input: { ...baseRun, specVersion, ...field('output') },
      })
      for (const [eventType, key, siblings] of [
        ['step_completed', 'result', {}],
        ['step_created', 'input', { stepName: 'step//fixture' }],
        ['hook_received', 'payload', {}],
        [
          'run_created',
          'input',
          { deploymentId: 'dpl_fixture', workflowName: 'workflow//fixture' },
        ],
      ]) {
        cases.push({
          name: `${eventType}.${key}/v${specVersion}/${valueName}`,
          schema: 'CreateEventSchema',
          field: key,
          valueName,
          input: {
            eventType,
            correlationId: 'correlation_fixture',
            specVersion,
            eventData: { ...siblings, ...field(key) },
          },
        })
      }
    }
  }
  return cases
}

export const invalidCases = [
  ['WorkflowRunSchema', { ...baseRun, completedAt: 'invalid', output: null }],
  ['WorkflowRunSchema', { ...baseRun, status: 'pending', output: null }],
  [
    'WorkflowRunSchema',
    {
      ...baseRun,
      status: 'failed',
      output: null,
      error: { message: 'fixture' },
    },
  ],
  ['WorkflowRunSchema', { ...baseRun, status: 'cancelled', output: null }],
  ...['step_completed', 'step_created', 'hook_received', 'run_created'].flatMap(
    (eventType) => [
      ['CreateEventSchema', { eventType, correlationId: 3, eventData: {} }],
      [
        'CreateEventSchema',
        { eventType, correlationId: 'fixture', eventData: null },
      ],
    ],
  ),
  [
    'CreateEventSchema',
    {
      eventType: 'step_created',
      correlationId: 'fixture',
      eventData: { stepName: 3 },
    },
  ],
  [
    'CreateEventSchema',
    {
      eventType: 'run_created',
      eventData: { deploymentId: 3, workflowName: 'fixture' },
    },
  ],
]

export function normalized(input) {
  const result = { ...input }
  for (const key of ['createdAt', 'updatedAt', 'completedAt']) {
    if (key in result) result[key] = new Date(result[key])
  }
  return result
}
