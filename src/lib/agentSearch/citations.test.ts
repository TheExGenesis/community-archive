import {
  collectToolTweetIds,
  extractCitationIds,
  splitCitations,
  validateCitations,
} from './citations'

describe('agent search citations', () => {
  test('extracts each cited id once, in order', () => {
    expect(
      extractCitationIds('A [[t:12]] and B [[t:34]] then A again [[t:12]].'),
    ).toEqual(['12', '34'])
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
})
