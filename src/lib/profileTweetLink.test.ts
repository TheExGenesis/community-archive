import { parseProfileTweetId } from './profileTweetLink'

test.each([
  ['1234567890123456789', '1234567890123456789'],
  [
    'https://x.com/alice/status/1234567890123456789?s=20',
    '1234567890123456789',
  ],
  [
    'https://twitter.com/alice/status/1234567890123456789',
    '1234567890123456789',
  ],
  [
    'https://community-archive.org/tweets/1234567890123456789?from=profile',
    '1234567890123456789',
  ],
  ['/tweets/1234567890123456789', '1234567890123456789'],
])('extracts an archived tweet ID from %s', (input, expected) => {
  expect(parseProfileTweetId(input)).toBe(expected)
})

test.each([
  '',
  'not a tweet',
  'https://example.com/tweets/123',
  'https://x.com/alice/likes/123',
  'https://x.com/alice/status/not-a-number',
  '123456789012345678901',
])('rejects invalid or unsupported tweet references: %s', (input) => {
  expect(parseProfileTweetId(input)).toBeNull()
})
