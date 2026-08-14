import { extractResponseText, generateDigestWithOpenAI } from './openai'

describe('OpenAI digest adapter', () => {
  const originalApiKey = process.env.OPENAI_API_KEY

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = originalApiKey
  })

  test('extracts structured output text from a Responses API message', () => {
    expect(
      extractResponseText({
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: '{"stories":[]}' }],
          },
        ],
      }),
    ).toBe('{"stories":[]}')
  })

  test('sends a non-stored strict schema request and records usage', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const fetcher = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'resp_123',
          model: 'gpt-test',
          output_text:
            '{"executive_summary":"summary","stories":[],"trending_keywords":[]}',
          usage: { input_tokens: 100, output_tokens: 25, total_tokens: 125 },
        }),
        { status: 200 },
      ),
    ) as jest.MockedFunction<typeof fetch>

    const result = await generateDigestWithOpenAI(
      {
        runId: 'run-123',
        model: 'gpt-test',
        systemPrompt: 'System',
        userPrompt: 'Input',
        reasoningEffort: 'low',
        maxOutputTokens: 5_000,
      },
      fetcher,
    )

    const request = JSON.parse(String(fetcher.mock.calls[0][1]?.body))
    expect(request).toMatchObject({
      model: 'gpt-test',
      store: false,
      metadata: { digest_run_id: 'run-123' },
      text: { format: { type: 'json_schema', strict: true } },
    })
    expect(
      request.text.format.schema.properties.stories.items.required,
    ).toContain('category')
    expect(
      request.text.format.schema.properties.stories.items.properties.category
        .enum,
    ).toContain('participatory meme')
    expect(result).toMatchObject({
      responseId: 'resp_123',
      totalTokens: 125,
      output: { executive_summary: 'summary' },
      outputError: null,
    })
  })

  test('returns the raw response when structured output is invalid', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const fetcher = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'resp_invalid',
          model: 'gpt-test',
          output_text: 'not json',
        }),
        { status: 200 },
      ),
    ) as jest.MockedFunction<typeof fetch>

    const result = await generateDigestWithOpenAI(
      {
        runId: 'run-invalid',
        model: 'gpt-test',
        systemPrompt: 'System',
        userPrompt: 'Input',
      },
      fetcher,
    )

    expect(result.response).toMatchObject({ id: 'resp_invalid' })
    expect(result.output).toBe('not json')
    expect(result.outputError).toBe(
      'OpenAI structured output was not valid JSON',
    )
  })
})
