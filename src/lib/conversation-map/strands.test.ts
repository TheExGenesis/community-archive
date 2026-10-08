import { NextRequest } from 'next/server'
import { GET } from '@/app/api/conversation-map/route'
import { loadConversationMap } from './data'
import { findAiStrand, markAiStrand } from './strands'
import type { MapAnnotation } from './types'

jest.mock('./data', () => ({ loadConversationMap: jest.fn() }))
const fetchMock = jest.fn()
const annotation = (ids: string[]): MapAnnotation => ({
  id: ids.join('-'),
  label: 'Complete source',
  kind: 'discussion',
  day: 1,
  rank: 1,
  score: 12,
  tweets: ids.map((id) => ({ id })) as MapAnnotation['tweets'],
})
beforeEach(() => {
  jest.clearAllMocks()
  global.fetch = fetchMock
  process.env.CONVERSATION_MAP_VECTOR_URL = 'https://vector.example'
})
afterEach(() => {
  delete process.env.CONVERSATION_MAP_VECTOR_URL
})

it('uses a bounded year-filtered vector query and requests no source payload', async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, results: [{ key: '123' }] }),
  })
  expect(await findAiStrand(2025)).toEqual(new Set(['123']))
  const [url, options] = fetchMock.mock.calls[0]
  expect(String(url)).toBe('https://vector.example/embeddings/search')
  expect(JSON.parse(options.body)).toMatchObject({
    k: 200,
    with_payload: false,
    with_vector: false,
    filter: {
      must: [
        {
          key: 'created_at',
          range: { gte: '2025-01-01T00:00:00Z', lt: '2026-01-01T00:00:00Z' },
        },
      ],
    },
  })
})
it('never introduces vector-only sources or labels partially matched groups', () => {
  const rows = [annotation(['1']), annotation(['2', '3'])]
  const marked = markAiStrand(rows, new Set(['1', '2', '999']))
  expect(marked.map((row) => row.strand)).toEqual(['ai', undefined])
  expect(marked.map((row) => row.tweets)).toEqual(rows.map((row) => row.tweets))
})
it('rejects malformed vector results', async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, results: [{ key: 123 }] }),
  })
  await expect(findAiStrand(2025)).rejects.toThrow('invalid response')
})
it('recognizes explicit AI terms without matching substrings in unrelated words', () => {
  const ai = annotation(['1'])
  ai.tweets[0].text = 'How language models change creative work'
  const unrelated = annotation(['2'])
  unrelated.tweets[0].text = 'A mountain trail in the rain'
  expect(
    markAiStrand([ai, unrelated], new Set()).map((row) => row.strand),
  ).toEqual(['ai', undefined])
})
it('rejects unknown strands before fetching data', async () => {
  const response = await GET(
    new NextRequest(
      'https://example.test/api/conversation-map?year=2025&strand=anything',
    ),
  )
  expect(response.status).toBe(400)
  expect(loadConversationMap).not.toHaveBeenCalled()
})
it('returns a non-cacheable error when vector retrieval fails', async () => {
  jest
    .mocked(loadConversationMap)
    .mockResolvedValue({ year: 2025, years: [2025], annotations: [] })
  fetchMock.mockResolvedValue({ ok: false, status: 503 })
  const log = jest.spyOn(console, 'error').mockImplementation(() => {})
  const response = await GET(
    new NextRequest(
      'https://example.test/api/conversation-map?year=2025&strand=ai',
    ),
  )
  expect(response.status).toBe(502)
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  log.mockRestore()
})
