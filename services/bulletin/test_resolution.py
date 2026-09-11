"""Strict resolution provenance, independent of model quality."""
import datetime as dt
import unittest
import resolution
from tweet_context import PreparedContext, fingerprint


class ResolutionTests(unittest.TestCase):
    def setUp(self):
        now = dt.datetime(2026, 9, 11, tzinfo=dt.timezone.utc)
        self.seed = dict(tweet_id='1', account_id='10', full_text='Who wants a spare ticket?', created_at=now)
        self.reply = dict(tweet_id='2', account_id='10', full_text='All claimed now, thanks!',
            reply_to_tweet_id='1', created_at=now+dt.timedelta(hours=1))
        self.records = {'1': self.seed, '2': self.reply}
        self.context = PreparedContext('context', {i:fingerprint(r) for i,r in self.records.items()}, self.records)
        self.value = dict(state='resolved',tweet_id='2',evidence='All claimed now')

    def test_exact_author_reply_can_resolve_or_reopen(self):
        self.assertEqual(resolution.validate(self.value,self.seed,self.context)['state'],'resolved')
        self.value.update(state='open',evidence='Still available')
        self.reply['full_text']='Still available, looking for a taker.'
        self.context.sources['2']=fingerprint(self.reply)
        self.assertEqual(resolution.validate(self.value,self.seed,self.context)['state'],'open')

    def test_other_participants_and_quotes_cannot_resolve_seed(self):
        self.reply['account_id']='20'
        with self.assertRaisesRegex(ValueError,'author_evidence'):
            resolution.validate(self.value,self.seed,self.context)
        self.reply['account_id']='10'
        self.reply['reply_to_tweet_id']=None
        with self.assertRaisesRegex(ValueError,'reply_tree'):
            resolution.validate(self.value,self.seed,self.context)

    def test_entity_equivalent_author_evidence_keeps_raw_source_hash(self):
        self.reply['full_text']='All claimed &amp; closed.'
        self.context.sources['2']=fingerprint(self.reply)
        self.value['evidence']='All claimed & closed.'
        result=resolution.validate(self.value,self.seed,self.context)
        self.assertEqual(result['content_hash'],fingerprint(self.reply)[1])

    def test_invented_evidence_unknown_and_missing_output(self):
        self.value['evidence']='The role is filled'
        with self.assertRaisesRegex(ValueError,'exact_author_evidence'):
            resolution.validate(self.value,self.seed,self.context)
        with self.assertRaisesRegex(ValueError,'invalid_availability'):
            resolution.validate(None,self.seed,self.context)
        self.assertEqual(resolution.validate(dict(state='unknown',tweet_id=None,evidence=None),
            self.seed,self.context),dict(state='unknown',tweet_id=None,content_hash=None))

    def test_prompt_rejects_ambiguous_uptake_and_keeps_resolved_notices(self):
        for rule in ['remains is_notice=true','thank-you alone','Partial uptake','latest applicable author update']:
            self.assertIn(rule,resolution.RULES)


if __name__ == '__main__': unittest.main()
