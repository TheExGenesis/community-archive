import { authoritativeConversationFromArchiveTweet } from '../../services/process_archive/process_archive_upload'

test('preserves an authoritative conversation ID supplied by an archive', () => {
  expect(
    authoritativeConversationFromArchiveTweet({
      id_str: '100',
      conversation_id_str: '90',
      in_reply_to_status_id_str: '95',
    }),
  ).toMatchObject({
    tweet_id: '100',
    conversation_id: '90',
    producer_source: 'archive_upload',
    resolution_status: 'authoritative',
    attempt_count: 0,
    last_error: null,
  })
})

test('leaves ordinary archive roots and replies to the incremental trigger', () => {
  expect(
    authoritativeConversationFromArchiveTweet({
      id_str: '100',
      in_reply_to_status_id_str: '95',
    }),
  ).toBeNull()
})
