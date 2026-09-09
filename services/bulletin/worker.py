# /// script
# requires-python = ">=3.11"
# dependencies = ["psycopg[binary]==3.2.9", "duckdb==1.5.5"]
# ///
"""Incremental, bounded Bulletin worker. Run after a successful autorefresh."""
import argparse
import datetime as dt
from decimal import Decimal
import json
import os
import time
import urllib.request

import duckdb
import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from labels import validate_label
import upstream_filter as upstream
import clickhouse_source

MODEL = 'z-ai/glm-5.3-flash'
VERSION = 'bulletin-143dc2d-v1'
DAY_BUDGET = Decimal('0.10')
MONTH_BUDGET = Decimal('1.00')
MAX_OUTPUT = 2048
MAX_CALLS = 50
MAX_PAGES = 100
MAX_SECONDS = 900
LOCK = 712606570


def connect():
    return psycopg.connect(host=os.environ['POSTGRES_HOST'],
        port=os.environ.get('POSTGRES_PORT','5432'), user=os.environ['POSTGRES_USER'],
        password=os.environ['POSTGRES_PASSWORD'], dbname=os.environ.get('POSTGRES_DB','postgres'),
        sslmode=os.environ.get('PGSSLMODE','require'), connect_timeout=10,
        options='-c statement_timeout=30000 -c lock_timeout=3000 -c timezone=UTC',
        autocommit=True, row_factory=dict_row)


def candidates(engine, rows):
    engine.execute('CREATE OR REPLACE TEMP TABLE batch(id VARCHAR,text VARCHAR)')
    originals=[r for r in rows if r['allowed'] and not r['is_tombstone']
        and not r['reply_to_tweet_id'] and not r['retweet']
        and not r['full_text'].startswith('RT @')]
    if not originals:
        return []
    engine.executemany('INSERT INTO batch VALUES (?,?)',[(r['tweet_id'],r['full_text']) for r in originals])
    matches={x[0] for x in engine.execute('''SELECT id FROM batch WHERE
        regexp_matches(text,?,'i') OR regexp_matches(text,?,'i') OR regexp_matches(text,?,'i')''',
        [upstream.OFFER.pattern,upstream.ASK.pattern,upstream.CONVENTION.pattern]).fetchall()}
    return [r for r in originals if r['tweet_id'] in matches
        and upstream.side_of(upstream.clean_text(r['full_text'])) is not None]


def intake(db, engine, counts, started, run_id, window=None, rescan=False):
    now=dt.datetime.now(dt.timezone.utc)
    end=window[1] if window else now.replace(hour=0,minute=0,second=0,microsecond=0)
    start=window[0] if window else end-dt.timedelta(days=2)
    key=('backfill:' if window else 'daily:')+start.isoformat()+':'+end.isoformat()
    db.execute("INSERT INTO bulletin.scans(scan_key,window_start,window_end) VALUES(%s,%s,%s) ON CONFLICT DO NOTHING",(key,start,end))
    if rescan:
        db.execute("UPDATE bulletin.scans SET cursor_id='0',complete=false WHERE scan_key=%s",(key,))
    state=db.execute('SELECT * FROM bulletin.scans WHERE scan_key=%s',(key,)).fetchone()
    counts.update(source='clickhouse',window_start=start.isoformat(),window_end=end.isoformat(),scan_key=key)
    progress(db,run_id,counts)
    if state['complete']:
        return True
    after=state['cursor_id']
    for _ in range(MAX_PAGES):
        if time.monotonic()-started>MAX_SECONDS:
            return False
        page=clickhouse_source.page(start,end,after)
        rows=page['data']
        # Membership, consent and scrape blocks remain transactional policy state.
        allowed={r['account_id'] for r in db.execute('SELECT account_id FROM bulletin.allowed_accounts').fetchall()}
        for r in rows:
            r['allowed']=r['account_id'] in allowed and start<=r['created_at']<end
        originals=[r for r in rows if r['allowed'] and not r['is_tombstone']
            and not r['reply_to_tweet_id'] and not r['retweet'] and not r['full_text'].startswith('RT @')]
        shortlist=candidates(engine,rows)
        with db.transaction():
            if rows:
                db.execute('''DELETE FROM bulletin.decisions d USING
                  jsonb_to_recordset(%s) AS source(tweet_id text,content_hash text)
                  WHERE d.tweet_id=source.tweet_id AND (d.content_hash<>source.content_hash OR d.version<>%s)''',
                  (Jsonb([{'tweet_id':r['tweet_id'],'content_hash':r['content_hash']} for r in rows]),VERSION))
            if shortlist:
                db.execute('''INSERT INTO bulletin.decisions(tweet_id,account_id,posted_at,content_hash,version,status)
                  SELECT tweet_id,account_id,posted_at,content_hash,%s,'pending'
                  FROM jsonb_to_recordset(%s) AS source(tweet_id text,account_id text,posted_at timestamptz,content_hash text)
                  ON CONFLICT(tweet_id) DO UPDATE
                  SET account_id=excluded.account_id,posted_at=excluded.posted_at''',
                  (VERSION,Jsonb([{'tweet_id':r['tweet_id'],'account_id':r['account_id'],
                    'posted_at':r['created_at'].isoformat(),'content_hash':r['content_hash']} for r in shortlist])))
            next_id=page['next']
            if page['scanned'] and (not next_id or int(next_id)<=int(after)):
                raise RuntimeError('invalid_clickhouse_cursor')
            db.execute('UPDATE bulletin.scans SET cursor_id=%s,complete=%s,updated_at=now() WHERE scan_key=%s',
                (next_id or after,page['scanned']==0,key))
        counts['rows_seen']+=page['scanned']
        counts['eligible_originals']=counts.get('eligible_originals',0)+len(originals)
        counts['candidates_seen']+=len(shortlist)
        progress(db,run_id,counts)
        if page['scanned']==0:
            return True
        after=next_id
    return False


def current(db, tweet_id, lock=False):
    source=clickhouse_source.current(tweet_id)
    if not source:
        return None
    allowed=db.execute('SELECT username FROM bulletin.allowed_accounts WHERE account_id=%s',(source['account_id'],)).fetchone()
    if not allowed:
        return None
    source['username']=allowed['username']
    return source


def request_body(tweet, prompt):
    payload={'author':'@'+tweet['username'],'posted_at':tweet['created_at'].isoformat(),
        'text':tweet['full_text']}
    return json.dumps({'model':MODEL,'messages':[{'role':'system','content':prompt},
        {'role':'user','content':json.dumps(payload,ensure_ascii=False)}],
        'response_format':{'type':'json_object'},'max_tokens':MAX_OUTPUT,
        'reasoning':{'effort':'low'},
        'provider':{'allow_fallbacks':False,'require_parameters':True,
          'max_price':{'prompt':0.15,'completion':0.50}}},ensure_ascii=False).encode()


def reservation(body):
    # UTF-8 bytes overestimate text tokens; add space for provider framing/schema.
    return (Decimal(len(body)+4096)*Decimal('.15')+MAX_OUTPUT*Decimal('.50'))/1_000_000


def reserve(db, job, amount, run_id=None, backfill_budget=None):
    # The session advisory lock serializes admission across overlapping jobs.
    with db.transaction():
        spent=db.execute('''SELECT
          coalesce(sum(coalesce(actual_usd,reserved_usd)) FILTER
            (WHERE c.created_at>=date_trunc('day',now()) AND NOT coalesce(r.counts ? 'backfill_budget_usd',false)),0) AS day,
          coalesce(sum(coalesce(actual_usd,reserved_usd)),0) AS month
          FROM bulletin.calls c LEFT JOIN bulletin.runs r ON r.id=c.run_id
          WHERE c.created_at>=date_trunc('month',now())''').fetchone()
        if spent['month']+amount>MONTH_BUDGET*Decimal('.9'):
            return None
        if backfill_budget is None:
            if spent['day']+amount>DAY_BUDGET*Decimal('.9'):
                return None
        else:
            # One explicit window owns a cumulative cap across retries/restarts.
            spent_backfill=db.execute('''SELECT coalesce(sum(coalesce(c.actual_usd,c.reserved_usd)),0) AS spent
              FROM bulletin.calls c JOIN bulletin.runs r ON r.id=c.run_id
              WHERE r.counts->>'scan_key'=(SELECT counts->>'scan_key' FROM bulletin.runs WHERE id=%s)''',
              (run_id,)).fetchone()['spent']
            if spent_backfill+amount>backfill_budget:
                return None
        call=db.execute('INSERT INTO bulletin.calls(reserved_usd,run_id) VALUES(%s,%s) RETURNING id',(amount,run_id)).fetchone()
        db.execute('''UPDATE bulletin.decisions SET attempts=attempts+1,last_attempt_at=now(),
          status='failed',updated_at=now() WHERE tweet_id=%s''',(job['tweet_id'],))
    return call['id']


def call_model(body):
    req=urllib.request.Request('https://openrouter.ai/api/v1/chat/completions',data=body,
        headers={'Authorization':'Bearer '+os.environ['OPENROUTER_API_KEY'],
          'Content-Type':'application/json','X-OpenRouter-Title':'Community Archive Bulletin'})
    with urllib.request.urlopen(req,timeout=60) as response:
        return json.load(response)


def actual_cost(result):
    value=result.get('usage',{}).get('cost')
    if value is None or isinstance(value,bool):
        return None
    cost=Decimal(str(value))
    return cost if cost.is_finite() and cost>=0 else None


def publish(db, job, label):
    with db.transaction():
        source=current(db,job['tweet_id'],lock=True)
        if not source or source['content_hash']!=job['content_hash']:
            db.execute('DELETE FROM bulletin.decisions WHERE tweet_id=%s',(job['tweet_id'],))
            return False
        db.execute('UPDATE bulletin.decisions SET status=%s,updated_at=now() WHERE tweet_id=%s',
            ('positive' if label['is_notice'] else 'negative',job['tweet_id']))
        if label['is_notice']:
            db.execute('''INSERT INTO bulletin.opportunities
              (tweet_id,content_hash,side,kind,summary,evidence,topics,respond,standing,expires_at,place,model)
              VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
              ON CONFLICT(tweet_id) DO NOTHING''',
              (job['tweet_id'],job['content_hash'],label['side'],label['kind'],label['summary'],
               label['evidence'],label['topics'],label['respond'],label['standing'],
               label['expires_at'],label['place'],MODEL))
    return True


def progress(db, run_id, counts, status='running', finished=False):
    with db.transaction():
        db.execute('UPDATE bulletin.worker_state SET counts=%s WHERE id=1',(Jsonb(counts),))
        db.execute('''UPDATE bulletin.runs SET counts=%s,status=%s,
          finished_at=CASE WHEN %s THEN now() ELSE finished_at END WHERE id=%s''',
          (Jsonb(counts),status,finished,run_id))


def run(db, limit=MAX_CALLS, enqueue_only=False, window=None, backfill_budget=None, rescan=False):
    if backfill_budget is not None and (window is None or not Decimal(0)<backfill_budget<=Decimal(1)):
        raise ValueError('backfill_budget_requires_window_and_at_most_one_dollar')
    if not db.execute('SELECT pg_try_advisory_lock(%s) AS locked',(LOCK,)).fetchone()['locked']:
        return {'status':'already_running'}
    started=time.monotonic()
    counts=dict(rows_seen=0,candidates_seen=0,calls=0,positive=0,negative=0,failed=0,suppressed=0)
    if backfill_budget is not None:
        counts['backfill_budget_usd']=str(backfill_budget)
    run_id=None
    try:
        # Owning the lock proves earlier 'running' rows no longer have a live worker.
        with db.transaction():
            db.execute("UPDATE bulletin.runs SET status='interrupted' WHERE status='running'")
            prompt=db.execute('SELECT id,body FROM bulletin.prompt_versions ORDER BY id DESC LIMIT 1').fetchone()
            if not prompt:
                raise RuntimeError('missing_active_prompt')
            run_id=db.execute('INSERT INTO bulletin.runs(model,classifier_version,prompt_version_id) VALUES(%s,%s,%s) RETURNING id',
                (MODEL,VERSION,prompt['id'])).fetchone()['id']
            db.execute("UPDATE bulletin.worker_state SET last_started_at=now(),last_finished_at=NULL,status='running',counts=%s WHERE id=1",
                (Jsonb(counts),))
        # Purge derived data when authoritative membership/consent changes.
        db.execute('''DELETE FROM bulletin.decisions d WHERE d.account_id IS NOT NULL AND NOT EXISTS
          (SELECT 1 FROM bulletin.allowed_accounts a WHERE a.account_id=d.account_id)''')
        engine=duckdb.connect()
        engine.execute('SET threads=1')
        engine.execute("SET memory_limit='128MB'")
        try:
            complete=intake(db,engine,counts,started,run_id,window,rescan)
        finally:
            engine.close()
        status='ok' if complete else 'intake_backlog'
        if not enqueue_only and complete:
            if not os.environ.get('OPENROUTER_API_KEY'):
                raise RuntimeError('missing_model_key')
            retry_delay=dt.timedelta(minutes=1 if backfill_budget is not None else 60)
            jobs=db.execute('''SELECT * FROM bulletin.decisions WHERE status IN ('pending','failed')
              AND attempts<3 AND (last_attempt_at IS NULL OR last_attempt_at<now()-%s)
              ORDER BY updated_at LIMIT %s''',(retry_delay,limit)).fetchall()
            for job in jobs:
                if time.monotonic()-started>MAX_SECONDS:
                    status='time_limit';break
                source=current(db,job['tweet_id'])
                if not source or source['content_hash']!=job['content_hash']:
                    db.execute('DELETE FROM bulletin.decisions WHERE tweet_id=%s',(job['tweet_id'],))
                    counts['suppressed']+=1;continue
                body=request_body(source,prompt['body'])
                if len(body)>65536:
                    status='oversize_candidate';continue
                amount=reservation(body)
                call_id=reserve(db,job,amount,run_id,backfill_budget)
                if call_id is None:
                    status='budget_limit';break
                counts['calls']+=1
                try:
                    result=call_model(body)
                    db.execute("UPDATE bulletin.calls SET actual_usd=%s,status='responded' WHERE id=%s",
                        (actual_cost(result),call_id))
                    choice=result['choices'][0]
                    if choice.get('finish_reason')!='stop':
                        raise ValueError('incomplete_output')
                    label=validate_label(json.loads(choice['message']['content']),{'text':source['full_text']})
                    stored=publish(db,job,label)
                    counts['positive' if label['is_notice'] else 'negative']+=int(stored)
                    counts['suppressed']+=int(not stored)
                    db.execute('UPDATE bulletin.calls SET status=%s WHERE id=%s',
                        ('validated' if stored else 'suppressed',call_id))
                except Exception as exc:
                    # Never persist provider bodies, prompts, authored text or credentials in logs.
                    db.execute('UPDATE bulletin.calls SET status=%s WHERE id=%s',
                        ('failed:'+type(exc).__name__,call_id))
                    counts['failed']+=1
                    status='classification_failed'
                progress(db,run_id,counts)
        pending=db.execute("SELECT count(*) AS n FROM bulletin.decisions WHERE status IN ('pending','failed')").fetchone()['n']
        counts['pending']=pending
        if enqueue_only:
            status='enqueued_only'
        elif pending and status=='ok':
            status='pending_review'
        db.execute('''UPDATE bulletin.worker_state SET last_finished_at=now(),status=%s,counts=%s,
          last_success_at=CASE WHEN %s='ok' THEN now() ELSE last_success_at END WHERE id=1''',
          (status,Jsonb(counts),status))
        progress(db,run_id,counts,status,finished=True)
        return {'status':status,**counts}
    except Exception as exc:
        if run_id is not None:
            progress(db,run_id,counts,'failed:'+type(exc).__name__,finished=True)
        db.execute('''UPDATE bulletin.worker_state SET last_finished_at=now(),status=%s,counts=%s WHERE id=1''',
            ('failed:'+type(exc).__name__,Jsonb(counts)))
        raise
    finally:
        db.execute('SELECT pg_advisory_unlock(%s)',(LOCK,))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--enqueue-only',action='store_true')
    parser.add_argument('--limit',type=int,default=MAX_CALLS)
    parser.add_argument('--start',help='Backfill UTC date, inclusive')
    parser.add_argument('--end',help='Backfill UTC date, exclusive (at most 15 days)')
    parser.add_argument('--backfill-budget-usd',type=Decimal,help='Explicit one-time cap, at most $1; requires start/end')
    parser.add_argument('--rescan',action='store_true',help='Revisit the window from the start; keep cached decisions and spending')
    args=parser.parse_args()
    window=None
    if args.start or args.end:
        try:
            window=tuple(dt.datetime.combine(dt.date.fromisoformat(value),dt.time(),dt.timezone.utc) for value in (args.start,args.end))
            if not dt.timedelta(0)<window[1]-window[0]<=dt.timedelta(days=15):
                raise ValueError()
        except (ValueError,TypeError):
            parser.error('start/end must form a UTC window of at most 15 days')
    if not 0<=args.limit<=MAX_CALLS:
        parser.error('limit must be between 0 and 50')
    try:
        with connect() as db:
            result=run(db,args.limit,args.enqueue_only,window,args.backfill_budget_usd,args.rescan)
        print(json.dumps(result),flush=True)
        raise SystemExit(0 if result['status'] in ('ok','already_running','enqueued_only') else 1)
    except Exception as exc:
        print(json.dumps({'status':'failed','error_type':type(exc).__name__}),flush=True)
        raise SystemExit(1)
