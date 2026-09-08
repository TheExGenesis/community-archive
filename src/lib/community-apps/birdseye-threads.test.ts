import { groupBirdseyeSources, selectBirdseyeSources } from './birdseye-threads'
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

const source = (
  id: string,
  username: string | null,
  reply: string | null = null,
  conversation: string | null = null,
) => ({
  tweet_id: id,
  username,
  reply_to_tweet_id: reply,
  conversation_id: conversation,
})

test('keeps owner tweets and reply participants, but not a separately quoted thread', () => {
  // 10 is the owner's quote of 1. Quoting does not make them a reply participant.
  const rows = [
    { ...source('10', 'Christineist'), quoted_tweet_id: '1' },
    source('1', 'qc'),
    source('2', 'qc', '1'),
    source('11', 'friend', '10'),
    source('12', 'christineist', '11'),
    source('20', 'friend'),
    source('21', 'christineist', '20'),
    source('30', 'unrelated'),
  ]
  expect(
    selectBirdseyeSources(
      rows.map((row) => row.tweet_id),
      rows,
      'christineist',
    ).map(({ id }) => id),
  ).toEqual(['10', '11', '12', '20', '21'])
  // If Christine also replies to QC, that conversation becomes valid context.
  rows.push(source('3', 'christineist', '2'))
  expect(
    selectBirdseyeSources(
      rows.map((row) => row.tweet_id),
      rows,
      'christineist',
    ).map(({ id }) => id),
  ).toEqual(['10', '11', '12', '1', '2', '3', '20', '21'])
})

test('uses shared reply conversations, omits unrelated missing metadata, and never inserts uncited owners', () => {
  const rows = [
    source('1', 'alice', '90', '80'),
    source('2', 'bob', '91', '80'),
    source('3', 'bob', '4'),
    source('4', 'alice'),
    source('5', null),
  ]
  expect(
    selectBirdseyeSources(['1', '2', '3', '5', '6'], rows, 'ALICE'),
  ).toEqual([
    { id: '1', threadId: '1' },
    { id: '2', threadId: '1' },
  ])
})
