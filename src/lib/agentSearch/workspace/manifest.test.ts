import {
  describeManifest,
  manifestFileFor,
  manifestFromOutputs,
  MAX_TEXT_FILE_CHARS,
} from './manifest'

describe('manifestFileFor', () => {
  test('a tweet file keeps ids, scores and short fields, never text', () => {
    const file = manifestFileFor(
      [
        '{"id":"1","author":"a","text":"secret","p":0.9,"group":"pro","note":"' +
          'x'.repeat(80) +
          '"}',
        '2',
      ].join('\n'),
    )
    expect(file).toEqual({
      kind: 'tweets',
      rows: [{ id: '1', p: 0.9, x: { group: 'pro' } }, { id: '2' }],
    })
    expect(JSON.stringify(file)).not.toContain('secret')
  })

  test('other files are notes, and large ones are not carried', () => {
    expect(manifestFileFor('3 authors\n')).toEqual({
      kind: 'text',
      text: '3 authors\n',
    })
    expect(manifestFileFor('a'.repeat(MAX_TEXT_FILE_CHARS + 1))).toBeNull()
  })
})

describe('manifestFromOutputs', () => {
  test('replays tweet-file changes in order, ignoring notes and bad rows', () => {
    const manifest = manifestFromOutputs([
      {
        workspace: {
          's1.jsonl': { kind: 'tweets', rows: [{ id: '1' }] },
          'old.jsonl': { kind: 'tweets', rows: [{ id: '2' }] },
          'notes.txt': { kind: 'text', text: 'tweet text' },
        },
      },
      null,
      { summary: 'no workspace' },
      {
        workspace: {
          'old.jsonl': null,
          'bad.jsonl': { kind: 'tweets', rows: [{ id: 'abc' }] },
          's1.jsonl': {
            kind: 'tweets',
            rows: [{ id: '1', p: 0.4 }, { id: '3' }],
          },
        },
      },
    ])
    expect(manifest).toEqual({
      's1.jsonl': { kind: 'tweets', rows: [{ id: '1', p: 0.4 }, { id: '3' }] },
    })
    expect(describeManifest(manifest)).toEqual(['s1.jsonl · 2 tweets'])
  })
})
