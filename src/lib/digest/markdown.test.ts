import { markdownToPlainText } from './markdown'

describe('markdownToPlainText', () => {
  test('keeps readable copy while removing inline formatting syntax', () => {
    expect(
      markdownToPlainText(
        '**Claude** made an *unexpected* [`move`](https://example.com) ~~today~~.',
      ),
    ).toBe('Claude made an unexpected move today.')
  })
})
