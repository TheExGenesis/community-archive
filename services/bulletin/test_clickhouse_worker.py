"""Focused cross-store worker checks; local DB contains policy/job state only."""
import datetime as dt
from decimal import Decimal
import hashlib
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch
import psycopg
from psycopg.rows import dict_row
import worker
from test_worker import FIXTURE, ROOT
from labels import SYSTEM

@unittest.skipUnless(os.environ.get('BULLETIN_TEST_DSN'),'requires local disposable database')
class ClickHouseWorkerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db=psycopg.connect(os.environ['BULLETIN_TEST_DSN'],autocommit=True,row_factory=dict_row)
        if cls.db.info.dbname!='bulletin_test' or cls.db.info.host not in ('127.0.0.1','localhost','/tmp'):
            raise RuntimeError('Tests require a named local disposable database')
        cls.db.execute('DROP SCHEMA IF EXISTS bulletin CASCADE; DROP SCHEMA IF EXISTS tes CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public')
        cls.db.execute(FIXTURE)
        for name in ('opportunities','run_history','prompt_versions','clickhouse'):
            cls.db.execute(next((ROOT/'supabase/migrations').glob('*_bulletin_'+name+'.sql')).read_text())
    @classmethod
    def tearDownClass(cls): cls.db.close()
    def setUp(self):
        self.db.execute('TRUNCATE bulletin.decisions,bulletin.calls,bulletin.runs,bulletin.scans,bulletin.prompt_versions,public.all_account,public.members,public.optin,tes.blocked_scraping_users RESTART IDENTITY CASCADE')
        self.db.execute("INSERT INTO public.all_account VALUES ('10','alice',false); INSERT INTO public.members VALUES ('10')")
        self.db.execute("INSERT INTO bulletin.prompt_versions(body,note) VALUES (%s,'Initial')",(SYSTEM,))
        self.window=(dt.datetime(2026,9,1,tzinfo=dt.timezone.utc),dt.datetime(2026,9,2,tzinfo=dt.timezone.utc))
        text='Happy to help anyone with their Python project; DM me.'
        self.source=dict(tweet_id='1',account_id='10',created_at=self.window[0],updated_at=self.window[0],
          full_text=text,content_hash=hashlib.sha256(text.encode()).hexdigest(),reply_to_tweet_id=None,is_tombstone=0,retweet=False,allowed=True,username='alice')
        self.label=dict(is_notice=True,side='offer',kind='help',summary='Offers Python help.',evidence='Happy to help',topics=['python'],respond='dm',standing=False,expires_at=None,place=None)
        self.patches=[patch.object(worker.clickhouse_source,'page',side_effect=self.page),
          patch.object(worker.clickhouse_source,'current',side_effect=lambda _:dict(self.source) if self.source else None),
          patch.dict(os.environ,OPENROUTER_API_KEY='test')]
        for p in self.patches:p.start();self.addCleanup(p.stop)
    def page(self,start,end,after):
        return {'data':[dict(self.source)] if after=='0' else [],'scanned':500 if after=='0' else 0,'next':'500' if after=='0' else None,'source':'clickhouse'}
    def response(self,body):
        return {'choices':[{'finish_reason':'stop','message':{'content':json.dumps(self.label)}}],'usage':{'cost':.001}}
    def run_worker(self,**kwargs):
        with patch.object(worker,'call_model',side_effect=self.response) as model:
            result=worker.run(self.db,window=self.window,**kwargs)
        return result,model.call_count
    def test_prompt_permissions_conflicts_and_validation(self):
        for role in ('anon','authenticated'):
            self.db.execute('SET ROLE '+role)
            try:
                for sql in ["SELECT public.get_bulletin_prompts()", "SELECT public.save_bulletin_prompt(1,'test','note','00000000-0000-0000-0000-000000000001')"]:
                    with self.assertRaises(psycopg.errors.InsufficientPrivilege):self.db.execute(sql)
            finally:self.db.execute('RESET ROLE')
        self.db.execute('SET ROLE service_role')
        try:
            for sql in ["UPDATE bulletin.prompt_versions SET body='changed'", "DELETE FROM bulletin.prompt_versions"]:
                with self.assertRaises(psycopg.errors.InsufficientPrivilege):self.db.execute(sql)
            with self.assertRaises(psycopg.errors.CheckViolation):
                self.db.execute("SELECT public.save_bulletin_prompt(1,'','note','00000000-0000-0000-0000-000000000001')")
            with self.assertRaises(psycopg.errors.InvalidParameterValue):
                self.db.execute("SELECT public.save_bulletin_prompt(1,'test','note',NULL)")
            self.db.execute("SELECT public.save_bulletin_prompt(1,'updated','note','00000000-0000-0000-0000-000000000001')")
            with self.assertRaises(psycopg.errors.SerializationFailure):
                self.db.execute("SELECT public.save_bulletin_prompt(1,'stale','note','00000000-0000-0000-0000-000000000001')")
            page=self.db.execute('SELECT public.get_bulletin_prompts() data').fetchone()['data']
            self.assertEqual(page['active']['body'],'updated')
            older=self.db.execute('SELECT public.get_bulletin_prompts(%s) data',(int(page['active']['id']),)).fetchone()['data']
            self.assertEqual(older['versions'][0]['id'],'1')
            self.assertEqual(older['active']['body'],'updated')
        finally:self.db.execute('RESET ROLE')

    def test_clickhouse_only_tweet_publishes_and_replay_reuses_decision(self):
        result,calls=self.run_worker()
        self.assertEqual((result['status'],result['rows_seen'],result['eligible_originals'],calls),('ok',500,1,1))
        self.assertEqual(self.db.execute('SELECT count(*) AS n FROM public.tweets').fetchone()['n'],0)
        state=self.db.execute('SELECT public.get_bulletin_board_state(2000) AS data').fetchone()['data']
        self.assertEqual(state[0]['account_id'],'10')
        self.assertEqual(self.run_worker()[1],0)
    def test_negative_is_cached_and_changed_text_is_reclassified(self):
        self.label={'is_notice':False};self.run_worker()
        self.assertEqual(self.run_worker()[1],0)
        self.source['full_text']+=' I have time tomorrow.'
        self.source['content_hash']=hashlib.sha256(self.source['full_text'].encode()).hexdigest()
        self.assertEqual(self.run_worker(rescan=True)[1],1)
    def test_policy_change_during_model_call_suppresses_result(self):
        original=self.response
        def optout(body):
            self.db.execute("INSERT INTO public.optin VALUES ('10','alice',true)")
            return original(body)
        self.response=optout
        result,_=self.run_worker()
        self.assertEqual(result['suppressed'],1)
        self.assertEqual(self.db.execute('SELECT count(*) AS n FROM bulletin.opportunities').fetchone()['n'],0)
    def test_failed_page_does_not_advance_cursor(self):
        with patch.object(worker.clickhouse_source,'page',side_effect=RuntimeError('unavailable')):
            with self.assertRaises(RuntimeError):self.run_worker()
        self.assertEqual(self.db.execute('SELECT cursor_id FROM bulletin.scans').fetchone()['cursor_id'],'0')
        self.assertEqual(self.run_worker()[0]['status'],'ok')
    def test_prompt_is_pinned_and_budget_keeps_unresolved_reservations(self):
        original=self.response
        def change(body):
            self.assertEqual(json.loads(body)['messages'][0]['content'],SYSTEM)
            self.db.execute("INSERT INTO bulletin.prompt_versions(body,note) VALUES ('New prompt','Change')")
            return original(body)
        self.response=change;self.run_worker()
        self.assertEqual(self.db.execute('SELECT prompt_version_id FROM bulletin.runs').fetchone()['prompt_version_id'],1)
        self.db.execute("INSERT INTO bulletin.calls(reserved_usd) VALUES (.10)")
        self.db.execute("UPDATE bulletin.decisions SET status='pending',last_attempt_at=NULL")
        self.assertEqual(self.run_worker()[0]['status'],'budget_limit')
    def test_backfill_cap_survives_restart_and_keeps_its_window_metadata(self):
        self.run_worker(backfill_budget=Decimal('.05'))
        self.db.execute('UPDATE bulletin.calls SET actual_usd=.05')
        self.db.execute("UPDATE bulletin.decisions SET status='pending',last_attempt_at=NULL")
        result,calls=self.run_worker(backfill_budget=Decimal('.05'))
        self.assertEqual((result['status'],calls),('budget_limit',0))
        keys=self.db.execute("SELECT count(DISTINCT counts->>'scan_key') AS n FROM bulletin.runs").fetchone()['n']
        self.assertEqual(keys,1)

    def test_approved_backfill_retries_earlier_without_resetting_attempts(self):
        self.run_worker(enqueue_only=True)
        self.db.execute("UPDATE bulletin.decisions SET status='failed',attempts=1,last_attempt_at=now()-interval '2 minutes'")
        self.assertEqual(self.run_worker()[1],0)
        result,calls=self.run_worker(backfill_budget=Decimal('.05'))
        self.assertEqual((result['status'],calls),('ok',1))
        self.assertEqual(self.db.execute('SELECT attempts FROM bulletin.decisions').fetchone()['attempts'],2)

    def test_browser_cannot_read_state_and_backfill_does_not_touch_daily_cursor(self):
        old=self.db.execute('SELECT cursor_at,cursor_id FROM bulletin.worker_state').fetchone()
        self.run_worker()
        self.assertEqual(old,self.db.execute('SELECT cursor_at,cursor_id FROM bulletin.worker_state').fetchone())
        with self.assertRaises(psycopg.errors.InsufficientPrivilege):
            with self.db.transaction():
                self.db.execute('SET LOCAL ROLE authenticated')
                self.db.execute('SELECT public.get_bulletin_board_state(10)')

if __name__=='__main__':unittest.main()
