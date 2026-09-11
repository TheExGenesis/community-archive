"""Focused cross-store worker checks; local DB contains policy/job state only."""
import datetime as dt
from decimal import Decimal
import hashlib
import json
import os
from pathlib import Path
import unittest
import urllib.error
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
        for name in ('opportunities','run_history','prompt_versions','clickhouse','refresh_requests'):
            cls.db.execute(next((ROOT/'supabase/migrations').glob('*_bulletin_'+name+'.sql')).read_text())
    @classmethod
    def tearDownClass(cls): cls.db.close()
    def setUp(self):
        self.db.execute('TRUNCATE bulletin.decisions,bulletin.calls,bulletin.runs,bulletin.scans,bulletin.refresh_requests,bulletin.prompt_versions,public.all_account,public.members,public.optin,tes.blocked_scraping_users RESTART IDENTITY CASCADE')
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

    def queue_refresh(self,request_id='00000000-0000-4000-8000-000000000001',budget='.10',selection='latest',prompt=1):
        return self.db.execute('SELECT public.request_bulletin_refresh(%s,%s,%s,%s,%s) id',
            (request_id,selection,prompt,Decimal(budget),'00000000-0000-0000-0000-000000000001')).fetchone()['id']

    def run_refresh(self,**kwargs):
        with patch.object(worker,'call_model',side_effect=self.response) as model:
            result=worker.run(self.db,queued_only=True,**kwargs)
        return result,model.call_count

    def test_refresh_reclassifies_and_removes_notice_with_pinned_prompt(self):
        self.run_worker()
        self.db.execute("INSERT INTO bulletin.prompt_versions(body,note) VALUES ('Changed prompt','Change')")
        request=self.queue_refresh(prompt=2)
        self.db.execute("INSERT INTO bulletin.prompt_versions(body,note) VALUES ('Later prompt','Later')")
        self.label={'is_notice':False}
        original=self.response
        def respond(body):
            self.assertEqual(json.loads(body)['messages'][0]['content'],'Changed prompt')
            return original(body)
        self.response=respond
        result,calls=self.run_refresh()
        self.assertEqual((result['status'],calls),('ok',1))
        self.assertEqual(self.db.execute('SELECT count(*) n FROM bulletin.opportunities').fetchone()['n'],0)
        self.assertEqual(self.db.execute('SELECT status FROM bulletin.refresh_requests WHERE id=%s',(request,)).fetchone()['status'],'complete')
        self.assertEqual(self.run_refresh()[0]['status'],'queue_empty')

    def test_refresh_updates_positive_and_preserves_notice_on_model_failure(self):
        self.run_worker();self.queue_refresh()
        self.label['summary']='Updated offer.'
        self.run_refresh()
        self.assertEqual(self.db.execute('SELECT summary FROM bulletin.opportunities').fetchone()['summary'],'Updated offer.')
        self.queue_refresh('00000000-0000-4000-8000-000000000002')
        with patch.object(worker,'call_model',side_effect=self.http_error(401)):
            self.assertEqual(worker.run(self.db,queued_only=True)['status'],'classification_failed')
        self.assertEqual(self.db.execute('SELECT summary FROM bulletin.opportunities').fetchone()['summary'],'Updated offer.')

    def test_refresh_resumes_without_resetting_attempts_or_cost_cap(self):
        self.run_worker();self.queue_refresh(budget='.01')
        with patch.object(worker,'MAX_PAGES',1):
            self.assertEqual(self.run_refresh()[0]['status'],'intake_backlog')
        self.db.execute("UPDATE bulletin.decisions SET attempts=2,last_attempt_at=now()-interval '2 minutes'")
        result,calls=self.run_refresh()
        self.assertEqual((result['status'],calls),('ok',1))
        self.assertEqual(self.db.execute('SELECT attempts FROM bulletin.decisions').fetchone()['attempts'],3)
        self.assertEqual(self.db.execute('SELECT count(*) n FROM bulletin.calls').fetchone()['n'],2)

    def test_refresh_budget_and_monthly_limit_stop_without_losing_notice(self):
        self.run_worker();request=self.queue_refresh(budget='.01')
        with patch.object(worker,'MAX_PAGES',1):self.run_refresh()
        self.db.execute("INSERT INTO bulletin.calls(reserved_usd,run_id) SELECT .01,id FROM bulletin.runs ORDER BY id DESC LIMIT 1")
        result,calls=self.run_refresh()
        self.assertEqual((result['status'],calls),('budget_limit',0))
        self.assertEqual(self.db.execute('SELECT count(*) n FROM bulletin.opportunities').fetchone()['n'],1)
        dashboard=self.db.execute('SELECT public.get_bulletin_refreshes() data').fetchone()['data']
        self.assertEqual((dashboard[0]['status'],dashboard[0]['spent_usd']),('stopped',.01))
        self.queue_refresh('00000000-0000-4000-8000-000000000002',budget='1')
        self.db.execute('INSERT INTO bulletin.calls(reserved_usd) VALUES (.90)')
        self.assertEqual(self.run_refresh()[0]['status'],'budget_limit')

    def test_refresh_is_idempotent_serialized_and_private(self):
        self.run_worker();request=self.queue_refresh()
        self.assertEqual(self.queue_refresh(),request)
        with self.assertRaises(psycopg.errors.ObjectNotInPrerequisiteState):
            self.queue_refresh('00000000-0000-4000-8000-000000000002')
        for role in ('anon','authenticated'):
            self.db.execute('SET ROLE '+role)
            try:
                with self.assertRaises(psycopg.errors.InsufficientPrivilege):self.queue_refresh()
                with self.assertRaises(psycopg.errors.InsufficientPrivilege):
                    self.db.execute('SELECT public.get_bulletin_refreshes()')
            finally:self.db.execute('RESET ROLE')

    def test_service_role_can_queue_and_read_but_not_delete_refresh_history(self):
        self.run_worker()
        self.db.execute('SET ROLE service_role')
        try:
            request=self.queue_refresh()
            dashboard=self.db.execute('SELECT public.get_bulletin_refreshes() data').fetchone()['data']
            self.assertEqual(dashboard[0]['id'],request)
            with self.assertRaises(psycopg.errors.InsufficientPrivilege):
                self.db.execute('DELETE FROM bulletin.refresh_requests')
        finally:self.db.execute('RESET ROLE')

    def test_refresh_waits_for_daily_lock_without_changing_request(self):
        self.run_worker();self.queue_refresh()
        with psycopg.connect(os.environ['BULLETIN_TEST_DSN'],autocommit=True) as other:
            other.execute('SELECT pg_advisory_lock(%s)',(worker.LOCK,))
            self.assertEqual(self.run_refresh()[0]['status'],'already_running')
            self.assertEqual(self.db.execute('SELECT status FROM bulletin.refresh_requests').fetchone()['status'],'queued')
        self.assertEqual(self.run_refresh()[0]['status'],'ok')

    def test_refresh_rejects_stale_prompt_and_invalid_cap_and_covers_fourteen_days(self):
        with self.assertRaises(psycopg.errors.SerializationFailure):self.queue_refresh(prompt=2)
        with self.assertRaises(psycopg.errors.InvalidParameterValue):self.queue_refresh(budget='1.01')
        with self.assertRaises(psycopg.errors.InvalidParameterValue):self.queue_refresh()
        self.queue_refresh(selection='two_weeks')
        request=self.db.execute('SELECT * FROM bulletin.refresh_requests').fetchone()
        self.assertEqual(request['window_end']-request['window_start'],dt.timedelta(days=14))
        self.assertEqual(request['window_end'].hour,0)

    def test_daily_run_does_not_consume_refresh_candidates(self):
        self.run_worker();self.queue_refresh()
        with patch.object(worker,'MAX_PAGES',1):self.run_refresh()
        self.assertEqual(self.run_worker()[1],0)
        self.assertEqual(self.run_refresh()[1],1)

    def test_refresh_rechecks_policy_and_recovers_abandoned_running_request(self):
        self.run_worker();self.queue_refresh()
        self.db.execute("UPDATE bulletin.refresh_requests SET status='running'")
        original=self.response
        def optout(body):
            self.db.execute("INSERT INTO public.optin VALUES ('10','alice',true)")
            return original(body)
        self.response=optout
        self.assertEqual(self.run_refresh()[0]['suppressed'],1)
        self.assertEqual(self.db.execute('SELECT count(*) n FROM bulletin.opportunities').fetchone()['n'],0)

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

    def http_error(self,code=503):
        return urllib.error.HTTPError('https://example.invalid/secret',code,'private provider message',{},None)

    def test_transient_errors_retry_in_same_run_and_recover(self):
        with patch.object(worker,'call_model',side_effect=[self.http_error(),self.http_error(429),self.response(None)]) as model, \
                patch.object(worker.time,'sleep') as sleep:
            result=worker.run(self.db,window=self.window)
        self.assertEqual((result['status'],result['calls'],result['failed'],result['pending']),('ok',3,2,0))
        self.assertEqual(model.call_count,3)
        self.assertEqual(sleep.call_count,2)
        self.assertEqual(self.db.execute('SELECT attempts FROM bulletin.decisions').fetchone()['attempts'],3)
        calls=self.db.execute('SELECT status,actual_usd FROM bulletin.calls ORDER BY id').fetchall()
        self.assertEqual([c['status'] for c in calls],['failed:HTTPError:503','failed:HTTPError:429','validated'])
        self.assertIsNone(calls[0]['actual_usd'])
        self.assertIsNone(calls[1]['actual_usd'])

    def test_transient_failure_stops_at_durable_attempt_limit(self):
        with patch.object(worker,'call_model',side_effect=self.http_error()) as model,patch.object(worker.time,'sleep'):
            result=worker.run(self.db,window=self.window)
        self.assertEqual((result['status'],result['calls'],result['pending']),('classification_failed',3,1))
        self.db.execute("UPDATE bulletin.decisions SET last_attempt_at=now()-interval '2 hours'")
        self.assertEqual(self.run_worker()[1],0)

    def test_auth_error_does_not_immediately_retry(self):
        with patch.object(worker,'call_model',side_effect=self.http_error(401)),patch.object(worker.time,'sleep') as sleep:
            result=worker.run(self.db,window=self.window)
        self.assertEqual(result['calls'],1)
        sleep.assert_not_called()

    def test_retries_obey_call_limit(self):
        with patch.object(worker,'call_model',side_effect=self.http_error()),patch.object(worker.time,'sleep'):
            result=worker.run(self.db,window=self.window,limit=2)
        self.assertEqual((result['calls'],result['pending']),(2,1))

    def test_retry_must_reserve_budget_again(self):
        body=worker.request_body(self.source,SYSTEM)
        cap=worker.reservation(body)*Decimal('1.5')
        with patch.object(worker,'call_model',side_effect=self.http_error()),patch.object(worker.time,'sleep'):
            result=worker.run(self.db,window=self.window,backfill_budget=cap)
        self.assertEqual((result['status'],result['calls']),('budget_limit',1))

    def test_retry_does_not_start_near_deadline(self):
        with patch.object(worker.time,'monotonic',return_value=0) as clock, \
                patch.object(worker.time,'sleep') as sleep,patch.object(worker,'MAX_SECONDS',65):
            def fail(body):
                clock.return_value=10
                raise self.http_error()
            with patch.object(worker,'call_model',side_effect=fail):
                result=worker.run(self.db,window=self.window)
        self.assertEqual(result['calls'],1)
        sleep.assert_not_called()

    def test_publication_error_does_not_repeat_paid_model_call(self):
        with patch.object(worker,'call_model',side_effect=self.response) as model, \
                patch.object(worker,'publish',side_effect=self.http_error()), \
                patch.object(worker.time,'sleep') as sleep:
            result=worker.run(self.db,window=self.window)
        self.assertEqual((result['status'],model.call_count),('classification_failed',1))
        self.assertIsNotNone(self.db.execute('SELECT actual_usd FROM bulletin.calls').fetchone()['actual_usd'])
        sleep.assert_not_called()

    def test_policy_change_before_retry_suppresses_call(self):
        def optout(_):
            self.db.execute("INSERT INTO public.optin VALUES ('10','alice',true)")
        with patch.object(worker,'call_model',side_effect=self.http_error()) as model, \
                patch.object(worker.time,'sleep',side_effect=optout):
            result=worker.run(self.db,window=self.window)
        self.assertEqual((result['status'],result['calls'],result['suppressed'],result['pending']),('ok',1,1,0))
        self.assertEqual(model.call_count,1)

    def test_browser_cannot_read_state_and_backfill_does_not_touch_daily_cursor(self):
        old=self.db.execute('SELECT cursor_at,cursor_id FROM bulletin.worker_state').fetchone()
        self.run_worker()
        self.assertEqual(old,self.db.execute('SELECT cursor_at,cursor_id FROM bulletin.worker_state').fetchone())
        with self.assertRaises(psycopg.errors.InsufficientPrivilege):
            with self.db.transaction():
                self.db.execute('SET LOCAL ROLE authenticated')
                self.db.execute('SELECT public.get_bulletin_board_state(10)')

if __name__=='__main__':unittest.main()
