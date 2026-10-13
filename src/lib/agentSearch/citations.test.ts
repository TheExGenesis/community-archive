import {
  collectToolTweetIds,
  collectWorkspaceFiles,
  extractCitationIds,
  splitCitations,
  splitPostLists,
  validateCitations,
} from './citations'

describe('agent search citations', () => {
  test('extracts each cited id once, in order', () => {
    expect(
      extractCitationIds('A [[t:12]] and B [[t:34]] then A again [[t:12]].'),
    ).toEqual(['12', '34'])
  })

  test('accepts a bare [[<id>]], which some models write', () => {
    expect(
      extractCitationIds('A [[12]] and B [[t:34]] [[posts: x | 5]]'),
    ).toEqual(['12', '34', '5'])
  })

  test('a quote marker cites its tweet', () => {
    expect(extractCitationIds('A [[q:7 | their words]] then [[t:8]]')).toEqual([
      '7',
      '8',
    ])
  })

  test('accepts only ids that a tool returned in the same run', () => {
    const seen = collectToolTweetIds([
      { tweets: [{ id: '12', text: 'x' }] },
      {
        kept: [{ id: '34', text: 'y', p: 0.9 }],
        quotedTweet: { id: '56', text: 'z' },
      },
    ])
    expect(validateCitations('[[t:12]] [[t:56]] [[t:99]]', seen)).toEqual({
      cited: ['12', '56'],
      invalid: ['99'],
    })
  })

  test('ignores objects that are not tweets', () => {
    expect(
      Array.from(
        collectToolTweetIds([{ members: [{ id: '1', username: 'a' }] }]),
      ),
    ).toEqual([])
  })

  test('splits text around citation markers', () => {
    expect(splitCitations('Hi [[t:1]]!')).toEqual([
      { type: 'text', value: 'Hi ' },
      { type: 'cite', id: '1' },
      { type: 'text', value: '!' },
    ])
  })

  test('reads post lists of ids or workspace files, and validates every id', () => {
    const text =
      'Intro [[t:1]]\n[[posts: Living there | 2, 3, 2]]\nThen [[posts:  | lists/a.jsonl]] end'
    expect(splitPostLists(text)).toEqual([
      { type: 'text', value: 'Intro [[t:1]]\n' },
      {
        type: 'list',
        label: 'Living there',
        ids: ['2', '3'],
        path: null,
        view: { kind: 'tweets' },
      },
      { type: 'text', value: '\nThen ' },
      {
        type: 'list',
        label: null,
        ids: [],
        path: 'lists/a.jsonl',
        view: { kind: 'tweets' },
      },
      { type: 'text', value: ' end' },
    ])
    const files = new Map([['lists/a.jsonl', ['4', '9']]])
    expect(extractCitationIds(text, files)).toEqual(['1', '2', '3', '4', '9'])
    expect(validateCitations(text, ['1', '2', '3', '4'], files)).toEqual({
      cited: ['1', '2', '3', '4'],
      invalid: ['9'],
    })
  })

  test('a list may say how to show it; its ids are read the same way', () => {
    const text = '[[posts: Based there | lists/sg.jsonl | people, 2 each]]'
    expect(splitPostLists(text)).toEqual([
      {
        type: 'list',
        label: 'Based there',
        ids: [],
        path: 'lists/sg.jsonl',
        view: { kind: 'people', showcase: 2 },
      },
    ])
    expect(
      extractCitationIds(text, new Map([['lists/sg.jsonl', ['5', '6']]])),
    ).toEqual(['5', '6'])
  })

  test('refuses unsafe workspace paths and keeps the latest write of a file', () => {
    expect(splitPostLists('[[posts: x | ../etc/passwd]]')[0]).toMatchObject({
      ids: [],
      path: null,
    })
    expect(
      collectWorkspaceFiles([
        { files: { 'a.jsonl': ['1'] } },
        { files: { 'a.jsonl': ['2', 'x'], '../b': ['3'] } },
      ]),
    ).toEqual(new Map([['a.jsonl', ['2']]]))
  })
})
