import { isVerbatim } from './quotes'

const TWEET =
  "@lumpenspace @0xsublime_horor As someone who does live in Singapore (I'm the token 🇸🇬 friend!!!) we aren't fascist wtf. are there &amp; more"

test('a quote matches the tweet despite case, punctuation, apostrophes and an ellipsis', () => {
  expect(
    isVerbatim(
      'As someone who does live in Singapore … we aren’t fascist',
      TWEET,
    ),
  ).toBe(true)
  expect(
    isVerbatim(
      'as someone who does live in singapore... we aren’t fascist',
      TWEET,
    ),
  ).toBe(true)
  expect(isVerbatim('there & more', TWEET)).toBe(true)
})

test('words the tweet does not have, or pieces out of order, do not match', () => {
  expect(isVerbatim('we are not fascist', TWEET)).toBe(false)
  expect(
    isVerbatim('we aren’t fascist … as someone who does live', TWEET),
  ).toBe(false)
  // Whole words only: "live in sing" is not in the tweet.
  expect(isVerbatim('live in sing', TWEET)).toBe(false)
})
