"""Context preparation and input contract checks, without network/model calls."""
import datetime as dt
import hashlib
import json
from pathlib import Path
import unittest
import urllib.error
from unittest.mock import Mock, patch

import tweet_context as context
import worker
from labels import SYSTEM, validate_label


class TweetContextTests(unittest.TestCase):
    def setUp(self):
        self.seed = self.row('1', '10', 'Looking for someone to review my draft; details below.')
        self.rows = [self.seed,
            self.row('2', '10', 'The draft is about community governance.', parent='1'),
            self.row('3', '20', 'I can read it on Friday.', parent='2'),
            self.row('4', '20', 'Unrelated question in another conversation.')]
        self.payload = self.rows
        self.allowed = {'10', '20'}
        self.db = Mock()
        self.db.execute.return_value.fetchall.side_effect = lambda: [
            {'account_id': account} for account in self.allowed]
        self.patches = [
            patch.object(context.plaintext, 'fetch_context', side_effect=lambda *args: self.payload),
            patch.object(context, 'fresh_rows', side_effect=lambda ids: [dict(r) for r in self.rows if r['tweet_id'] in ids]),
            patch.dict(context.os.environ, CLICKHOUSE_ANALYTICS_API_TOKEN='test',
                CLICKHOUSE_ANALYTICS_API_URL='https://gateway.invalid')]
        for p in self.patches:
            p.start()
            self.addCleanup(p.stop)

    @staticmethod
    def row(ident, account, text, parent=None):
        return dict(tweet_id=ident, account_id=account, username='author'+account,
            full_text=text, created_at=dt.datetime(2026, 9, 11, tzinfo=dt.timezone.utc),
            reply_to_tweet_id=parent, is_tombstone=False, retweet=False)

    def test_attributes_seed_and_nearby_replies_and_excludes_unrelated_posts(self):
        prepared = context.prepare(self.db, self.seed)
        self.assertIn('@author10 [SEED]', prepared.text)
        self.assertIn('Replies to: 1', prepared.text)
        self.assertIn('community governance', prepared.text)
        self.assertIn('@author20', prepared.text)
        self.assertNotIn('Unrelated question', prepared.text)
        self.assertEqual(set(prepared.sources), {'1', '2', '3'})
        context.plaintext.fetch_context.assert_called_once_with(
            '1', 'radius', 'test', 'https://gateway.invalid')

    def test_quotes_and_missing_context_are_explicit(self):
        self.rows[1]['quoted_tweet_id'] = '5'
        quote = self.row('5', '20', 'The referenced draft is available here.')
        self.rows.append(quote)
        prepared = context.prepare(self.db, self.seed)
        self.assertIn('Quotes: 5', prepared.text)
        self.assertIn(quote['full_text'], prepared.text)
        self.rows.pop()
        self.assertIn('quoted targets are unavailable', context.prepare(self.db, self.seed).text)

    def test_filters_current_consent_and_detects_optout_after_model_call(self):
        prepared = context.prepare(self.db, self.seed)
        self.allowed.remove('20')
        self.assertFalse(context.still_current(self.db, prepared))
        safe = context.prepare(self.db, self.seed)
        self.assertNotIn('I can read it', safe.text)
        self.assertNotIn('3', safe.sources)

    def test_refresh_removes_changed_or_deleted_cached_context(self):
        self.payload = [dict(row) for row in self.rows]
        self.rows[1]['full_text'] = 'Changed after the cached thread was fetched.'
        self.rows[2]['is_tombstone'] = True
        prepared = context.prepare(self.db, self.seed)
        self.assertEqual(set(prepared.sources), {'1'})
        self.assertNotIn('community governance', prepared.text)
        self.assertNotIn('I can read it', prepared.text)
        self.assertIn('context blocks omitted', prepared.text)

    def test_stale_seed_uses_only_current_seed_without_old_graph(self):
        self.payload = [dict(row) for row in self.rows]
        self.payload[0]['full_text'] = 'An older version of the tweet.'
        prepared = context.prepare(self.db, self.seed)
        self.assertEqual(set(prepared.sources), {'1'})
        self.assertIn(self.seed['full_text'], prepared.text)
        self.assertNotIn('community governance', prepared.text)

    def test_seed_optout_aborts_preparation(self):
        self.allowed.remove('10')
        with self.assertRaisesRegex(RuntimeError, 'seed_changed_or_disallowed'):
            context.prepare(self.db, self.seed)

    def test_transient_outage_is_not_silently_treated_as_no_replies(self):
        context.plaintext.fetch_context.side_effect = TimeoutError()
        with self.assertRaises(TimeoutError):
            context.prepare(self.db, self.seed)
        context.plaintext.fetch_context.side_effect = urllib.error.HTTPError(
            'https://gateway.invalid', 404, 'missing', {}, None)
        self.assertIn('only the current seed', context.prepare(self.db, self.seed).text)

    def test_limits_keep_seed_whole_and_prioritize_author_clarifications(self):
        self.rows = [self.seed] + [self.row(str(i), '20', 'Other participant', '1') for i in range(2, 40)]
        self.rows.append(self.row('40', '10', 'Author clarification.', '1'))
        self.payload = {'data': {'conversationTweets': self.rows}, 'query': {'truncated': True}}
        prepared = context.prepare(self.db, self.seed)
        self.assertLessEqual(len(prepared.sources), 21)
        self.assertIn('Author clarification', prepared.text)
        self.assertIn('500 tweets', prepared.text)
        with patch.object(context, 'MAX_CHARACTERS', 1):
            small = context.prepare(self.db, self.seed)
        self.assertEqual(set(small.sources), {'1'})
        self.assertIn(self.seed['full_text'], small.text)
        self.assertIn('omitted whole tweets', small.text)

    def test_contract_keeps_joke_exclusion_and_seed_evidence(self):
        prepared = context.prepare(self.db, self.seed)
        body = worker.request_body(self.seed, SYSTEM, prepared)
        messages = json.loads(body)['messages']
        self.assertEqual(messages[0]['content'], SYSTEM)
        self.assertIn('Keep excluding jokes', messages[1]['content'])
        self.assertIn('still vague', messages[1]['content'])
        payload = json.loads(messages[2]['content'])
        self.assertEqual(payload['text'], self.seed['full_text'])
        self.assertEqual(payload['context'], prepared.text)
        self.assertGreater(worker.reservation(body), 0)
        label = dict(is_notice=True, side='ask', kind='feedback', summary='Seeks draft feedback.',
            evidence=self.rows[1]['full_text'], topics=[], respond='reply', standing=False,
            expires_at=None, place=None)
        with self.assertRaisesRegex(ValueError, 'exact source substring'):
            validate_label(label, {'text': self.seed['full_text']})

    def test_vendor_files_match_pinned_skill(self):
        root = Path(context.__file__).parent / 'vendor' / 'tweet_plaintext'
        manifest = json.loads((root / 'source.json').read_text())
        for name, expected in manifest['sha256'].items():
            self.assertEqual(hashlib.sha256((root / name).read_bytes()).hexdigest(), expected)


if __name__ == '__main__':
    unittest.main()
