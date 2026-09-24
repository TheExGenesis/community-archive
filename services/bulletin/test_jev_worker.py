# /// script
# requires-python = ">=3.11"
# dependencies = ["psycopg[binary]==3.2.9", "duckdb==1.5.5"]
# ///
"""Focused Jev worker and board switch checks on disposable PostgreSQL."""
import datetime as dt
import hashlib
from http.client import RemoteDisconnected
import os
from pathlib import Path
import time
import unittest
from unittest.mock import patch

import psycopg
from psycopg.rows import dict_row

import jev_model as model
import jev_worker
import import_jev_snapshot
from tweet_context import PreparedContext
from labels import SYSTEM
from test_worker import FIXTURE, ROOT


@unittest.skipUnless(os.environ.get('BULLETIN_TEST_DSN'),'requires disposable local database')
class JevWorkerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db=psycopg.connect(os.environ['BULLETIN_TEST_DSN'],autocommit=True,row_factory=dict_row)
        if cls.db.info.dbname!='bulletin_test' or cls.db.info.host not in ('127.0.0.1','localhost','/tmp'):
            raise RuntimeError('Tests require a named local disposable database')
        cls.db.execute('DROP SCHEMA IF EXISTS bulletin CASCADE; DROP SCHEMA IF EXISTS tes CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public')
        cls.db.execute(FIXTURE)
        for name in ('opportunities','run_history','prompt_versions','clickhouse','refresh_requests','resolution_status'):
            cls.db.execute(next((ROOT/'supabase/migrations').glob('*_bulletin_'+name+'.sql')).read_text())
        cls.db.execute(next((ROOT/'supabase/migrations').glob('*_bulletin_jev_shadow.sql')).read_text())

    @classmethod
    def tearDownClass(cls):
        cls.db.close()

    def setUp(self):
        self.db.execute('''TRUNCATE bulletin.jev_items,bulletin.decisions,bulletin.calls,
          bulletin.runs,bulletin.scans,bulletin.prompt_versions,public.all_account,
          public.members,public.optin,tes.blocked_scraping_users RESTART IDENTITY CASCADE''')
        self.db.execute("UPDATE bulletin.pipeline_state SET active='legacy' WHERE id=1")
        self.db.execute("INSERT INTO public.all_account VALUES ('10','alice',false); INSERT INTO public.members VALUES ('10')")
        self.db.execute("INSERT INTO bulletin.prompt_versions(body,note) VALUES (%s,'Initial')",(SYSTEM,))
        self.window=(dt.datetime(2026,9,1,tzinfo=dt.timezone.utc),dt.datetime(2026,9,2,tzinfo=dt.timezone.utc))
        text='I have a funded residency opening in New York. DM me to apply.'
        self.source=dict(tweet_id='1',account_id='10',created_at=self.window[0],
            full_text=text,content_hash=hashlib.sha256(text.encode()).hexdigest(),
            reply_to_tweet_id=None,is_tombstone=False,retweet=False)
        self.calls=[]
        self.patches=[patch.object(jev_worker.clickhouse_source,'page',side_effect=self.page),
            patch.object(jev_worker,'source_batch',side_effect=self.sources),
            patch.object(jev_worker.jev_author,'context',return_value={'username':'alice','bio':'Researcher','representative_posts':[]}),
            patch.object(model,'call',side_effect=self.answer),
            patch.dict(os.environ,OPENROUTER_API_KEY='test')]
        for p in self.patches:
            p.start();self.addCleanup(p.stop)

    def page(self,start,end,after):
        return {'data':[dict(self.source)] if after=='0' else [],
            'scanned':1 if after=='0' else 0,'next':'1' if after=='0' else None}

    def sources(self,ids):
        return {'1':dict(self.source)} if '1' in ids else {}

    def answer(self,payload,key):
        self.calls.append(payload)
        answers={}
        for name,question in payload['questions'].items():
            if question['type']=='choice':
                choice=('offer' if name.endswith('disposition') else
                    'opportunity' if name.endswith('kind') else 'dm')
                answers[name]={'type':'choice','choice':choice,
                    'probabilities':{k:(.95 if k==choice else .05/(len(question['criteria'])-1))
                        for k in question['criteria']}}
            elif question['type']=='score':
                answers[name]={'type':'score','score':3.1,
                    'probabilities':{str(i):(.9 if i==3 else .025) for i in range(5)}}
            else:
                answers[name]={'type':'noul','noul':.95 if name.endswith('direct_action') else .1}
        return {'answers':answers,'usage':{'cost':.0001}}

    def test_shadow_cutover_rollback_and_policy(self):
        result=jev_worker.run(self.db,window=self.window,backfill_budget=.05)
        self.assertEqual((result['status'],len(self.calls)),('ok',3))
        item=self.db.execute('SELECT status,p_opportunity,p_direct,p_joke,value_score FROM bulletin.jev_items').fetchone()
        self.assertEqual(item['status'],'ready')
        self.assertEqual(len(self.db.execute('SELECT public.get_bulletin_board_state() data').fetchone()['data']),0)
        self.db.execute("UPDATE bulletin.pipeline_state SET active='jev'")
        board=self.db.execute('SELECT public.get_bulletin_board_state() data').fetchone()['data']
        self.assertEqual((len(board),board[0]['value_score'],board[0]['kind']),(1,3.1,'opportunity'))
        self.db.execute("INSERT INTO public.optin VALUES ('10','alice',true)")
        self.assertEqual(self.db.execute('SELECT public.get_bulletin_board_state() data').fetchone()['data'],[])
        self.db.execute("UPDATE bulletin.pipeline_state SET active='legacy'")

    def test_replay_reuses_decision_and_negative_stays_hidden(self):
        def negative(payload,key):
            return {'answers':{
            name:{'type':'choice','choice':'neither','probabilities':{'ask':.1,'offer':.1,'neither':.8}}
            for name in payload['questions']},'usage':{'cost':.0001}}
        with patch.object(model,'call',side_effect=negative):
            self.assertEqual(jev_worker.run(self.db,window=self.window,backfill_budget=.05)['status'],'ok')
        self.assertEqual(self.db.execute('SELECT status FROM bulletin.jev_items').fetchone()['status'],'rejected')
        self.assertEqual(jev_worker.run(self.db,window=self.window,backfill_budget=.05)['calls'],0)

    def test_snapshot_import_is_idempotent_and_shadow_only(self):
        row=dict(tweet_id='1',account_id='10',posted_at=self.window[0],
            content_hash=self.source['content_hash'],text=self.source['full_text'],
            disposition={'disposition':{'probabilities':{'offer':.95,'ask':.02,'neither':.03}}},
            enrichment={'direct_action':{'noul':.95}},value_answer={'joke':{'noul':.1},
                'value':{'score':3.1}},p_opportunity=.97,p_direct=.95,p_joke=.1,
            value_score=3.1,side='offer',kind='opportunity',summary='Residency opening.',
            evidence='funded residency opening',topics=['arts'],respond='dm',standing=False,
            status='ready')
        self.assertEqual(import_jev_snapshot.apply(self.db,[row]),{'ready':1})
        self.assertEqual(import_jev_snapshot.apply(self.db,[row]),{'ready':1})
        self.assertEqual(self.db.execute('SELECT count(*) n FROM bulletin.jev_items').fetchone()['n'],1)
        self.assertEqual(self.db.execute('SELECT public.get_bulletin_board_state() data').fetchone()['data'],[])

    def test_author_reply_can_resolve_jev_notice_with_verified_evidence(self):
        self.assertEqual(jev_worker.run(self.db,window=self.window,backfill_budget=.05)['status'],'ok')
        reply=dict(tweet_id='2',account_id='10',full_text='The residency is filled.',
            created_at=self.window[0]+dt.timedelta(hours=1),reply_to_tweet_id='1')
        seed={**self.source,'username':'alice'}
        context=PreparedContext('seed and author reply',{
            '1':('10',self.source['content_hash']),
            '2':('10',hashlib.sha256(reply['full_text'].encode()).hexdigest())},
            {'1':seed,'2':reply})
        context_reads=0
        model_calls=0
        def prepare_with_disconnect(db,source):
            nonlocal context_reads
            context_reads+=1
            if context_reads==1:
                raise RemoteDisconnected('gateway closed connection')
            return context
        def resolved(payload,key):
            nonlocal model_calls
            model_calls+=1
            if model_calls==1:
                raise RemoteDisconnected('provider closed connection')
            self.assertEqual(len(payload['questions']),1)
            return {'answers':{'reply_0':{'type':'choice','choice':'resolved',
                'probabilities':{'resolved':.95,'open':.02,'neither':.03}}},
                'usage':{'cost':.0001}}
        with patch.object(jev_worker.tweet_context,'prepare',side_effect=prepare_with_disconnect), \
             patch.object(jev_worker.tweet_context,'still_current',return_value=True), \
             patch.object(model,'call',side_effect=resolved), \
             patch.object(jev_worker.time,'sleep'):
            counts={'calls':0,'failed':0,'suppressed':0}
            self.assertEqual(jev_worker.check_resolutions(self.db,1,counts,time.monotonic(),10,'test'),'ok')
        self.assertEqual((context_reads,model_calls,counts['calls']),(2,2,2))
        saved=self.db.execute('SELECT resolution_state,resolution_tweet_id,context_digest FROM bulletin.jev_items').fetchone()
        self.assertEqual((saved['resolution_state'],saved['resolution_tweet_id']),('resolved','2'))
        self.assertEqual(self.db.execute("SELECT count(*) n FROM bulletin.calls WHERE status='failed:RemoteDisconnected'").fetchone()['n'],1)
        self.assertIsNotNone(saved['context_digest'])

    def test_shadow_state_is_private_and_cutover_requires_database_owner(self):
        for role in ('anon','authenticated'):
            self.db.execute('SET ROLE '+role)
            try:
                for query in ('SELECT * FROM bulletin.jev_items',
                              'SELECT * FROM bulletin.pipeline_state',
                              'SELECT public.get_bulletin_board_state()'):
                    with self.assertRaises(psycopg.errors.InsufficientPrivilege):
                        self.db.execute(query)
            finally:
                self.db.execute('RESET ROLE')
        self.db.execute('SET ROLE service_role')
        try:
            self.assertEqual(self.db.execute('SELECT active FROM bulletin.pipeline_state').fetchone()['active'],'legacy')
            with self.assertRaises(psycopg.errors.InsufficientPrivilege):
                self.db.execute("UPDATE bulletin.pipeline_state SET active='jev'")
        finally:
            self.db.execute('RESET ROLE')
        self.db.execute("INSERT INTO bulletin.decisions(tweet_id,content_hash,version,status) VALUES ('9','h','legacy','pending')")
        legacy=self.db.execute('SELECT public.get_bulletin_runs() data').fetchone()['data']['queue']
        self.assertEqual(legacy['pending'],1)
        self.db.execute("UPDATE bulletin.pipeline_state SET active='jev'")
        jev=self.db.execute('SELECT public.get_bulletin_runs() data').fetchone()['data']['queue']
        self.assertEqual(jev['pending'],0)

    def test_failed_model_call_reserves_cost_and_retries_same_source(self):
        with patch.object(model,'call',side_effect=ValueError('invalid provider response')):
            result=jev_worker.run(self.db,window=self.window,backfill_budget=.05)
        self.assertEqual((result['status'],result['pending']),('classification_failed',1))
        first=self.db.execute('SELECT status,phase,attempts FROM bulletin.jev_items').fetchone()
        self.assertEqual((first['status'],first['phase'],first['attempts']),('failed','disposition',1))
        call=self.db.execute('SELECT actual_usd,reserved_usd FROM bulletin.calls').fetchone()
        self.assertIsNone(call['actual_usd'])
        self.assertGreater(call['reserved_usd'],0)
        self.db.execute("UPDATE bulletin.jev_items SET last_attempt_at=now()-interval '2 minutes'")
        recovered=jev_worker.run(self.db,window=self.window,backfill_budget=.05)
        self.assertEqual(recovered['status'],'ok')
        self.assertEqual(self.db.execute('SELECT status FROM bulletin.jev_items').fetchone()['status'],'ready')

    def test_transient_disconnect_retries_with_separate_call_reservations(self):
        calls=0
        def disconnect_once(payload,key):
            nonlocal calls
            calls+=1
            if calls==1:
                raise RemoteDisconnected('connection closed')
            return self.answer(payload,key)
        with patch.object(model,'call',side_effect=disconnect_once), \
             patch.object(jev_worker.time,'sleep'):
            result=jev_worker.run(self.db,window=self.window,backfill_budget=.05)
        self.assertEqual((result['status'],result['calls']),('ok',4))
        self.assertEqual(self.db.execute('SELECT status FROM bulletin.jev_items').fetchone()['status'],'ready')
        self.assertEqual(self.db.execute("SELECT count(*) n FROM bulletin.calls WHERE status='failed:RemoteDisconnected'").fetchone()['n'],1)
        self.assertEqual(self.db.execute('SELECT count(*) n FROM bulletin.calls').fetchone()['n'],4)

    def test_failed_scan_does_not_advance_cursor(self):
        with patch.object(jev_worker.clickhouse_source,'page',side_effect=RuntimeError('gateway unavailable')):
            with self.assertRaises(RuntimeError):
                jev_worker.run(self.db,window=self.window,enqueue_only=True)
        state=self.db.execute('SELECT cursor_id,complete FROM bulletin.scans').fetchone()
        self.assertEqual((state['cursor_id'],state['complete']),('0',False))
        self.assertEqual(jev_worker.run(self.db,window=self.window,enqueue_only=True)['status'],'enqueued_only')


if __name__=='__main__':
    unittest.main()
