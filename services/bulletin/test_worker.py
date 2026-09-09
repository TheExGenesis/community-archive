"""Focused integration checks against a disposable PostgreSQL database."""
import datetime as dt
from decimal import Decimal
import json
import os
from pathlib import Path
import types
import unittest
from unittest.mock import patch

import psycopg
from psycopg.rows import dict_row

import after_autorefresh
import worker
from labels import SYSTEM

ROOT=Path(__file__).resolve().parents[2]
FIXTURE='''
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
END $$;
CREATE SCHEMA tes;
CREATE TABLE public.all_account(account_id text PRIMARY KEY,username text,is_tombstone boolean DEFAULT false);
CREATE TABLE public.members(account_id text PRIMARY KEY);
CREATE VIEW public.user_directory AS SELECT account_id FROM public.members;
CREATE TABLE public.optin(twitter_user_id text,username text,explicit_optout boolean);
CREATE TABLE tes.blocked_scraping_users(account_id text,username text);
CREATE TABLE public.tweets(tweet_id text PRIMARY KEY,account_id text,full_text text,
  created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),
  is_tombstone boolean DEFAULT false,reply_to_tweet_id text);
CREATE TABLE public.retweets(tweet_id text);
GRANT USAGE ON SCHEMA public,tes TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public,tes TO service_role;
'''


class WrapperTests(unittest.TestCase):
    def test_downstream_runs_only_after_success(self):
        calls=[]
        def invoke(cmd,**kwargs):
            calls.append(cmd)
            return types.SimpleNamespace(returncode=1)
        self.assertEqual(after_autorefresh.run(Path('/pipeline'),invoke),1)
        self.assertEqual(len(calls),1)
        calls.clear()
        def success(cmd,**kwargs):
            calls.append(cmd)
            return types.SimpleNamespace(returncode=0)
        self.assertEqual(after_autorefresh.run(Path('/pipeline'),success),0)
        self.assertEqual(calls[-1],['systemctl','start','ca-bulletin.service'])


@unittest.skipUnless(os.environ.get('BULLETIN_TEST_DSN'),'requires disposable test database')
class DatabaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db=psycopg.connect(os.environ['BULLETIN_TEST_DSN'],autocommit=True,row_factory=dict_row)
        if cls.db.info.dbname!='bulletin_test' or cls.db.info.host not in ('127.0.0.1','localhost','/tmp'):
            cls.db.close()
            raise RuntimeError('Tests require the named local disposable database')
        cls.db.execute('DROP SCHEMA IF EXISTS bulletin CASCADE; DROP SCHEMA IF EXISTS tes CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public')
        cls.db.execute(FIXTURE)
        cls.db.execute(next((ROOT/'supabase/migrations').glob('*_bulletin_opportunities.sql')).read_text())
        cls.db.execute(next((ROOT/'supabase/migrations').glob('*_bulletin_run_history.sql')).read_text())
        cls.db.execute(next((ROOT/'supabase/migrations').glob('*_bulletin_prompt_versions.sql')).read_text())

    @classmethod
    def tearDownClass(cls):
        cls.db.close()

    def setUp(self):
        self.db.execute('TRUNCATE public.tweets,public.all_account,public.members,public.optin,tes.blocked_scraping_users,public.retweets,bulletin.calls,bulletin.runs CASCADE')
        self.db.execute('TRUNCATE bulletin.prompt_versions RESTART IDENTITY CASCADE')
        self.db.execute("INSERT INTO bulletin.prompt_versions(body,note) VALUES (%s,'Initial prompt')",(SYSTEM,))
        self.db.execute("UPDATE bulletin.worker_state SET cursor_at=now()-interval '1 day',cursor_id='',scan_until=NULL")
        self.db.execute("INSERT INTO public.all_account VALUES ('a','example',false); INSERT INTO public.members VALUES ('a')")

    def tweet(self,identifier='1',text='Happy to help anyone with their Python project; DM me.'):
        self.db.execute('INSERT INTO public.tweets(tweet_id,account_id,full_text) VALUES(%s,%s,%s)',(identifier,'a',text))

    def response(self,**changes):
        label=dict(is_notice=True,side='offer',kind='help',summary='Offers help with Python projects.',
            evidence='Happy to help',topics=['python'],respond='dm',standing=False,expires_at=None,place=None)
        label.update(changes)
        return {'choices':[{'finish_reason':'stop','message':{'content':json.dumps(label)}}],'usage':{'cost':0.001}}

    def run_worker(self,result=None):
        with patch.dict(os.environ,OPENROUTER_API_KEY='test'),patch.object(worker,'call_model',return_value=result or self.response()) as model:
            output=worker.run(self.db)
        return output,model.call_count

    def test_prompt_versions_pin_runs_and_only_affect_future_calls(self):
        self.tweet('1')
        self.tweet('2')
        bodies=[]
        newer=SYSTEM+'\nOnly return actionable offers.'
        def response(body):
            bodies.append(json.loads(body)['messages'][0]['content'])
            if len(bodies)==1:
                self.db.execute("SELECT public.save_bulletin_prompt(1,%s,'Tighter offers','00000000-0000-0000-0000-000000000001')",(newer,))
            return self.response()
        with patch.dict(os.environ,OPENROUTER_API_KEY='test'),patch.object(worker,'call_model',side_effect=response):
            worker.run(self.db)
        self.assertEqual(bodies,[SYSTEM,SYSTEM])
        self.tweet('3')
        with patch.dict(os.environ,OPENROUTER_API_KEY='test'),patch.object(worker,'call_model',side_effect=response):
            worker.run(self.db)
        self.assertEqual(bodies,[SYSTEM,SYSTEM,newer])
        runs=self.db.execute('SELECT public.get_bulletin_runs() data').fetchone()['data']['runs']
        self.assertEqual([r['prompt_version_id'] for r in runs],['2','1'])
        self.assertEqual([r['prompt_body'] for r in runs],[newer,SYSTEM])

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

    def test_replay_negative_cache_and_changed_source(self):
        self.tweet()
        self.tweet('2','Looking for a joke about asking for help with Python.')
        with patch.dict(os.environ,OPENROUTER_API_KEY='test'),patch.object(worker,'call_model',side_effect=[self.response(),self.response(is_notice=False)]):
            result=worker.run(self.db)
        self.assertEqual((result['positive'],result['negative']),(1,1))
        self.assertEqual(self.run_worker()[1],0)
        self.db.execute("UPDATE public.tweets SET full_text='Looking for someone to review a new Python project.',updated_at=now() WHERE tweet_id='1'")
        self.assertEqual(self.db.execute('SELECT count(*) n FROM public.get_bulletin_opportunities()').fetchone()['n'],0)
        result,calls=self.run_worker(self.response(evidence='Looking for someone'))
        self.assertEqual(calls,1)
        self.assertEqual(result['positive'],1)

    def test_private_reads_expiry_optout_and_delete(self):
        self.tweet()
        self.run_worker()
        for role in ('anon','authenticated'):
            self.db.execute('SET ROLE '+role)
            try:
                with self.assertRaises(psycopg.errors.InsufficientPrivilege):
                    self.db.execute('SELECT * FROM bulletin.opportunities')
                with self.assertRaises(psycopg.errors.InsufficientPrivilege):
                    self.db.execute('SELECT * FROM public.get_bulletin_opportunities()')
                with self.assertRaises(psycopg.errors.InsufficientPrivilege):
                    self.db.execute('SELECT * FROM public.get_bulletin_runs()')
            finally:self.db.execute('RESET ROLE')
        self.db.execute('SET ROLE service_role')
        try:self.assertEqual(len(self.db.execute('SELECT * FROM public.get_bulletin_opportunities()').fetchall()),1)
        finally:self.db.execute('RESET ROLE')
        self.db.execute("INSERT INTO public.optin VALUES (NULL,'example',true)")
        self.assertEqual(len(self.db.execute('SELECT * FROM public.get_bulletin_opportunities()').fetchall()),0)
        self.db.execute('TRUNCATE public.optin')
        self.db.execute("UPDATE bulletin.opportunities SET expires_at=current_date-1")
        self.assertEqual(len(self.db.execute('SELECT * FROM public.get_bulletin_opportunities()').fetchall()),0)
        self.db.execute('DELETE FROM public.tweets')
        self.assertEqual(self.db.execute('SELECT count(*) n FROM bulletin.opportunities').fetchone()['n'],0)
        self.assertEqual(self.db.execute('SELECT count(*) n FROM bulletin.calls').fetchone()['n'],1)

    def test_budget_timeout_and_invalid_evidence(self):
        self.tweet()
        with patch.dict(os.environ,OPENROUTER_API_KEY='test'),patch.object(worker,'call_model',side_effect=TimeoutError):
            result=worker.run(self.db)
        self.assertEqual(result['failed'],1)
        self.assertIsNone(self.db.execute('SELECT actual_usd FROM bulletin.calls').fetchone()['actual_usd'])
        self.assertEqual(self.run_worker()[1],0)
        self.db.execute("UPDATE bulletin.decisions SET last_attempt_at=now()-interval '2 hours'")
        self.db.execute("INSERT INTO bulletin.calls(reserved_usd) VALUES(.1)")
        result,calls=self.run_worker()
        self.assertEqual((result['status'],calls),('budget_limit',0))
        self.db.execute('TRUNCATE bulletin.calls')
        result,calls=self.run_worker(self.response(evidence='Invented phrase'))
        self.assertEqual(result['failed'],1)
        self.assertEqual(self.db.execute('SELECT count(*) n FROM bulletin.opportunities').fetchone()['n'],0)

    def test_history_progress_failure_recovery_and_pagination(self):
        self.tweet()
        observed=[]
        def response(_):
            active=self.db.execute("SELECT * FROM bulletin.runs WHERE status='running'").fetchone()
            observed.append(active['counts']['rows_seen'])
            return self.response()
        with patch.dict(os.environ,OPENROUTER_API_KEY='test'),patch.object(worker,'call_model',side_effect=response):
            worker.run(self.db)
        self.assertEqual(observed,[1])
        first=self.db.execute('SELECT * FROM bulletin.runs').fetchone()
        self.assertEqual(first['counts']['positive'],1)
        self.assertEqual(first['status'],'ok')
        self.assertIsNotNone(first['finished_at'])
        self.db.execute("INSERT INTO bulletin.runs(model,classifier_version) VALUES ('test','test')")
        with patch.object(worker,'intake',side_effect=RuntimeError):
            with self.assertRaises(RuntimeError):worker.run(self.db)
        self.assertEqual(self.db.execute("SELECT count(*) n FROM bulletin.runs WHERE status='interrupted'").fetchone()['n'],1)
        latest=self.db.execute('SELECT * FROM bulletin.runs ORDER BY id DESC LIMIT 1').fetchone()
        self.assertEqual(latest['status'],'failed:RuntimeError')
        self.db.execute('SET ROLE service_role')
        try:
            page=self.db.execute('SELECT public.get_bulletin_runs(NULL,2) data').fetchone()['data']
            self.assertEqual(len(page['runs']),2)
            older=self.db.execute('SELECT public.get_bulletin_runs(%s,2) data',(int(page['runs'][-1]['id']),)).fetchone()['data']
            self.assertEqual(older['runs'][0]['id'],str(first['id']))
            self.assertEqual(Decimal(str(older['runs'][0]['actual_usd'])),Decimal('.001'))
        finally:self.db.execute('RESET ROLE')
        self.db.execute('DELETE FROM public.tweets')
        self.assertEqual(self.db.execute('SELECT count(*) n FROM bulletin.runs').fetchone()['n'],3)

    def test_policy_change_during_call_and_lock(self):
        self.tweet()
        def optout(_):
            self.db.execute("INSERT INTO public.optin VALUES ('a',NULL,true)")
            return self.response()
        with patch.dict(os.environ,OPENROUTER_API_KEY='test'),patch.object(worker,'call_model',side_effect=optout):
            result=worker.run(self.db)
        self.assertEqual(result['suppressed'],1)
        other=psycopg.connect(os.environ['BULLETIN_TEST_DSN'],autocommit=True,row_factory=dict_row)
        try:
            other.execute('SELECT pg_advisory_lock(%s)',(worker.LOCK,))
            self.assertEqual(worker.run(self.db)['status'],'already_running')
        finally:other.close()


if __name__=='__main__':unittest.main()
