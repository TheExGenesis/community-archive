import { extractResponseText, generateDigestWithModel } from './openai'

describe('OpenAI digest adapter', () => {
  const originalApiKey = process.env.OPENAI_API_KEY
  const originalDeepSeekApiKey = process.env.DEEPSEEK_API_KEY
  const originalOpenRouterApiKey = process.env.OPENROUTER_API_KEY

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = originalApiKey
    if (originalDeepSeekApiKey === undefined)
      delete process.env.DEEPSEEK_API_KEY
    else process.env.DEEPSEEK_API_KEY = originalDeepSeekApiKey
    if (originalOpenRouterApiKey === undefined)
      delete process.env.OPENROUTER_API_KEY
    else process.env.OPENROUTER_API_KEY = originalOpenRouterApiKey
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

  test('skips DeepSeek reasoning items when extracting structured output', () => {
    expect(
      extractResponseText({
        output: [
          {
            type: 'reasoning',
            content: [{ type: 'reasoning_text', text: 'private reasoning' }],
          },
          {
            type: 'message',
            content: [{ type: 'output_text', text: '{"keywords":[]}' }],
          },
        ],
      }),
    ).toBe('{"keywords":[]}')
  })

  test('sends a non-stored strict schema request and records usage', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const fetcher = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'resp_123',
          model: 'gpt-test',
          output_text:
            '{"executive_summary":["one","two","three"],"stories":[],"trending_keywords":[]}',
          usage: { input_tokens: 100, output_tokens: 25, total_tokens: 125 },
        }),
        { status: 200 },
      ),
    ) as jest.MockedFunction<typeof fetch>

    const result = await generateDigestWithModel(
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
    expect(request.text.format.schema.required).toContain(
      'representative_tweet_index',
    )
    expect(
      request.text.format.schema.properties.stories.items.properties.category
        .enum,
    ).toContain('Viral joke')
    expect(
      request.text.format.schema.properties.stories.items.required,
    ).toContain('editorial_note')
    expect(
      request.text.format.schema.properties.stories.items.required,
    ).toContain('tweet_indices')
    expect(
      request.text.format.schema.properties.stories.items.required,
    ).not.toContain('banger_tweet_ids')
    expect(
      request.text.format.schema.properties.executive_summary,
    ).toMatchObject({ type: 'array', minItems: 3, maxItems: 5 })
    expect(result).toMatchObject({
      responseId: 'resp_123',
      totalTokens: 125,
      output: { executive_summary: ['one', 'two', 'three'] },
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

    const result = await generateDigestWithModel(
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

  test('uses the DeepSeek Responses API with provider-neutral schema fields', async () => {
    process.env.DEEPSEEK_API_KEY = 'deepseek-test-key'
    const fetcher = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'resp_deepseek',
          model: 'deepseek-v4-pro',
          output: [
            {
              type: 'message',
              content: [
                {
                  type: 'output_text',
                  text: '{"executive_summary":[],"representative_tweet_index":0,"stories":[],"keywords":[]}',
                },
              ],
            },
          ],
          usage: { input_tokens: 90, output_tokens: 10, total_tokens: 100 },
        }),
        { status: 200 },
      ),
    ) as jest.MockedFunction<typeof fetch>

    const result = await generateDigestWithModel(
      {
        runId: 'run-deepseek',
        model: 'deepseek-v4-pro',
        systemPrompt: 'Return the digest schema.',
        userPrompt: 'Indexed corpus',
        reasoningEffort: 'low',
        maxOutputTokens: 6_000,
      },
      fetcher,
    )

    expect(fetcher.mock.calls[0][0]).toBe('https://api.deepseek.com/responses')
    const request = JSON.parse(String(fetcher.mock.calls[0][1]?.body))
    expect(request).toMatchObject({
      model: 'deepseek-v4-pro',
      reasoning: { effort: 'low' },
      max_output_tokens: 6_000,
      text: { format: { type: 'json_schema' } },
    })
    expect(request).not.toHaveProperty('metadata')
    expect(request).not.toHaveProperty('store')
    expect(request.text.format).not.toHaveProperty('strict')
    expect(result).toMatchObject({
      totalTokens: 100,
      responseId: 'resp_deepseek',
    })
  })

  test('uses OpenRouter chat completions with strict schema and zero-data-retention routing', async () => {
    process.env.OPENROUTER_API_KEY = 'openrouter-test-key'
    const fetcher = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'gen_openrouter',
          model: 'deepseek/deepseek-v4-flash-0731',
          choices: [
            {
              message: {
                content:
                  '{"executive_summary":[],"representative_tweet_index":0,"stories":[],"keywords":[]}',
              },
            },
          ],
          usage: {
            prompt_tokens: 90,
            completion_tokens: 10,
            total_tokens: 100,
          },
        }),
        { status: 200 },
      ),
    ) as jest.MockedFunction<typeof fetch>

    const result = await generateDigestWithModel(
      {
        runId: 'run-openrouter',
        model: 'deepseek/deepseek-v4-flash-0731',
        systemPrompt: 'Return the digest schema.',
        userPrompt: 'Indexed corpus',
        reasoningEffort: 'low',
        maxOutputTokens: 6_000,
        temperature: 0.2,
      },
      fetcher,
    )

    expect(fetcher.mock.calls[0][0]).toBe(
      'https://openrouter.ai/api/v1/chat/completions',
    )
    const request = JSON.parse(String(fetcher.mock.calls[0][1]?.body))
    expect(request).toMatchObject({
      model: 'deepseek/deepseek-v4-flash-0731',
      reasoning: { effort: 'low', exclude: true },
      provider: { data_collection: 'deny', zdr: true },
      max_tokens: 6_000,
      temperature: 0.2,
      response_format: {
        type: 'json_schema',
        json_schema: { strict: true },
      },
    })
    expect(result).toMatchObject({
      totalTokens: 100,
      responseId: 'gen_openrouter',
      model: 'deepseek/deepseek-v4-flash-0731',
      outputError: null,
    })
  })
})
