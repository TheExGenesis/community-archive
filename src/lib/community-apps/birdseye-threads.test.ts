import { groupBirdseyeSources } from './birdseye-threads'
test('groups reply chains and shared conversation IDs in parent-first order without adding uncited posts', () => {
  const rows = [
    { tweet_id: '3', reply_to_tweet_id: '2', conversation_id: null },
    { tweet_id: '2', reply_to_tweet_id: '1', conversation_id: null },
    { tweet_id: '6', reply_to_tweet_id: '5', conversation_id: '4' },
    { tweet_id: '7', reply_to_tweet_id: '99', conversation_id: '4' },
    { tweet_id: '100', reply_to_tweet_id: '1', conversation_id: null },
  ]
  expect(
    groupBirdseyeSources(['3', '8', '1', '7', '2', '6', '3'], rows),
  ).toEqual([
    { id: '1', threadId: '1' },
    { id: '2', threadId: '1' },
    { id: '3', threadId: '1' },
    { id: '8', threadId: '8' },
    { id: '6', threadId: '6' },
    { id: '7', threadId: '6' },
  ])
})
test('handles missing metadata, siblings with an uncited parent, and malformed cycles', () => {
  expect(
    groupBirdseyeSources(
      ['2', '1', '3'],
      [
        { tweet_id: '1', reply_to_tweet_id: '2', conversation_id: null },
        { tweet_id: '2', reply_to_tweet_id: '1', conversation_id: null },
      ],
    ),
  ).toEqual([
    { id: '1', threadId: '1' },
    { id: '2', threadId: '1' },
    { id: '3', threadId: '3' },
  ])
  expect(
    groupBirdseyeSources(
      ['2', '3'],
      [
        { tweet_id: '2', reply_to_tweet_id: '1', conversation_id: null },
        { tweet_id: '3', reply_to_tweet_id: '1', conversation_id: null },
      ],
    ),
  ).toEqual([
    { id: '2', threadId: '2' },
    { id: '3', threadId: '2' },
  ])
})
