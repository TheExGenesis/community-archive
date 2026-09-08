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

from labels import SYSTEM, validate_label
import upstream_filter as upstream

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


def intake(db, engine, counts, started):
    db.execute('UPDATE bulletin.worker_state SET scan_until=coalesce(scan_until,now()) WHERE id=1')
    state=db.execute('SELECT * FROM bulletin.worker_state WHERE id=1').fetchone()
    for _ in range(MAX_PAGES):
        if time.monotonic()-started>MAX_SECONDS:
            return False
        rows=db.execute('''WITH recent AS MATERIALIZED (
          SELECT tweet_id,account_id,created_at,updated_at,full_text,reply_to_tweet_id,is_tombstone
          FROM public.tweets WHERE created_at>=%s-interval '2 days' AND created_at<%s
        ), page AS MATERIALIZED (
          SELECT * FROM recent WHERE (updated_at,tweet_id)>(%s,%s)
            AND updated_at<%s ORDER BY updated_at,tweet_id LIMIT 1000
        ), allowed AS MATERIALIZED (SELECT * FROM bulletin.allowed_accounts)
        SELECT t.tweet_id,t.account_id,t.created_at,t.updated_at,t.full_text,
          t.reply_to_tweet_id,t.is_tombstone,a.account_id IS NOT NULL AS allowed,
          EXISTS(SELECT 1 FROM public.retweets r WHERE r.tweet_id=t.tweet_id) AS retweet,
          encode(sha256(convert_to(t.full_text,'UTF8')),'hex') AS content_hash
        FROM page t LEFT JOIN allowed a ON a.account_id=t.account_id
        ORDER BY t.updated_at,t.tweet_id''',
        (state['scan_until'],state['scan_until'],state['cursor_at'],state['cursor_id'],state['scan_until'])).fetchall()
        if not rows:
            # Revisit one hour to cover ordinary late commits. Content hashes prevent rebilling.
            db.execute('''UPDATE bulletin.worker_state SET cursor_at=scan_until-interval '1 hour',
              cursor_id='',scan_until=NULL WHERE id=1''')
            return True
        shortlist=candidates(engine,rows)
        with db.transaction():
            # One indexed page operation, not one network round trip per tweet.
            db.execute('''DELETE FROM bulletin.decisions d USING public.tweets t
              WHERE d.tweet_id=t.tweet_id AND t.tweet_id=ANY(%s)
                AND (d.content_hash<>encode(sha256(convert_to(t.full_text,'UTF8')),'hex')
                  OR d.version<>%s)''',([r['tweet_id'] for r in rows],VERSION))
            for r in shortlist:
                db.execute('''INSERT INTO bulletin.decisions(tweet_id,content_hash,version,status)
                  SELECT tweet_id,%s,%s,'pending' FROM public.tweets
                  WHERE tweet_id=%s AND NOT is_tombstone
                  ON CONFLICT(tweet_id) DO NOTHING''',(r['content_hash'],VERSION,r['tweet_id']))
            last=rows[-1]
            db.execute('UPDATE bulletin.worker_state SET cursor_at=%s,cursor_id=%s WHERE id=1',
                (last['updated_at'],last['tweet_id']))
        state['cursor_at'],state['cursor_id']=last['updated_at'],last['tweet_id']
        counts['rows_seen']+=len(rows)
        counts['candidates_seen']+=len(shortlist)
    return False


def current(db, tweet_id, lock=False):
    return db.execute('''SELECT t.tweet_id,t.account_id,t.created_at,t.full_text,a.username,
      encode(sha256(convert_to(t.full_text,'UTF8')),'hex') AS content_hash
      FROM public.tweets t JOIN bulletin.allowed_accounts a USING(account_id)
      WHERE t.tweet_id=%s AND NOT t.is_tombstone AND t.reply_to_tweet_id IS NULL
        AND t.full_text NOT LIKE 'RT @%%'
        AND NOT EXISTS(SELECT 1 FROM public.retweets r WHERE r.tweet_id=t.tweet_id)
      '''+(' FOR SHARE OF t' if lock else ''),(tweet_id,)).fetchone()


def request_body(tweet):
    payload={'author':'@'+tweet['username'],'posted_at':tweet['created_at'].isoformat(),
        'text':tweet['full_text']}
    return json.dumps({'model':MODEL,'messages':[{'role':'system','content':SYSTEM},
        {'role':'user','content':json.dumps(payload,ensure_ascii=False)}],
        'response_format':{'type':'json_object'},'max_tokens':MAX_OUTPUT,
        'reasoning':{'effort':'low'},
        'provider':{'allow_fallbacks':False,'require_parameters':True,
          'max_price':{'prompt':0.15,'completion':0.50}}},ensure_ascii=False).encode()


def reservation(body):
    # UTF-8 bytes overestimate text tokens; add space for provider framing/schema.
    return (Decimal(len(body)+4096)*Decimal('.15')+MAX_OUTPUT*Decimal('.50'))/1_000_000


def reserve(db, job, amount):
    # The session advisory lock serializes admission across overlapping jobs.
    with db.transaction():
        spent=db.execute('''SELECT
          coalesce(sum(coalesce(actual_usd,reserved_usd)) FILTER
            (WHERE created_at>=date_trunc('day',now())),0) AS day,
          coalesce(sum(coalesce(actual_usd,reserved_usd)),0) AS month
          FROM bulletin.calls WHERE created_at>=date_trunc('month',now())''').fetchone()
        if spent['day']+amount>DAY_BUDGET*Decimal('.9') or spent['month']+amount>MONTH_BUDGET*Decimal('.9'):
            return None
        call=db.execute('INSERT INTO bulletin.calls(reserved_usd) VALUES(%s) RETURNING id',(amount,)).fetchone()
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


def run(db, limit=MAX_CALLS, enqueue_only=False):
    if not db.execute('SELECT pg_try_advisory_lock(%s) AS locked',(LOCK,)).fetchone()['locked']:
        return {'status':'already_running'}
    started=time.monotonic()
    counts=dict(rows_seen=0,candidates_seen=0,calls=0,positive=0,negative=0,failed=0,suppressed=0)
    try:
        db.execute("UPDATE bulletin.worker_state SET last_started_at=now(),status='running' WHERE id=1")
        # Small feature tables only; remove data no longer eligible under current policy.
        db.execute('''DELETE FROM bulletin.decisions d USING public.tweets t
          WHERE d.tweet_id=t.tweet_id AND (t.is_tombstone OR NOT EXISTS
            (SELECT 1 FROM bulletin.allowed_accounts a WHERE a.account_id=t.account_id))''')
        engine=duckdb.connect()
        engine.execute('SET threads=1')
        engine.execute("SET memory_limit='128MB'")
        try:
            complete=intake(db,engine,counts,started)
        finally:
            engine.close()
        status='ok' if complete else 'intake_backlog'
        if not enqueue_only and complete:
            if not os.environ.get('OPENROUTER_API_KEY'):
                raise RuntimeError('missing_model_key')
            jobs=db.execute('''SELECT * FROM bulletin.decisions WHERE status IN ('pending','failed')
              AND attempts<3 AND (last_attempt_at IS NULL OR last_attempt_at<now()-interval '1 hour')
              ORDER BY updated_at LIMIT %s''',(limit,)).fetchall()
            for job in jobs:
                if time.monotonic()-started>MAX_SECONDS:
                    status='time_limit';break
                source=current(db,job['tweet_id'])
                if not source or source['content_hash']!=job['content_hash']:
                    db.execute('DELETE FROM bulletin.decisions WHERE tweet_id=%s',(job['tweet_id'],))
                    counts['suppressed']+=1;continue
                body=request_body(source)
                if len(body)>65536:
                    status='oversize_candidate';continue
                amount=reservation(body)
                call_id=reserve(db,job,amount)
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
        pending=db.execute("SELECT count(*) AS n FROM bulletin.decisions WHERE status IN ('pending','failed')").fetchone()['n']
        counts['pending']=pending
        if enqueue_only:
            status='enqueued_only'
        elif pending and status=='ok':
            status='pending_review'
        db.execute('''UPDATE bulletin.worker_state SET last_finished_at=now(),status=%s,counts=%s,
          last_success_at=CASE WHEN %s='ok' THEN now() ELSE last_success_at END WHERE id=1''',
          (status,Jsonb(counts),status))
        return {'status':status,**counts}
    except Exception as exc:
        db.execute('''UPDATE bulletin.worker_state SET last_finished_at=now(),status=%s,counts=%s WHERE id=1''',
            ('failed:'+type(exc).__name__,Jsonb(counts)))
        raise
    finally:
        db.execute('SELECT pg_advisory_unlock(%s)',(LOCK,))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--enqueue-only',action='store_true')
    parser.add_argument('--limit',type=int,default=MAX_CALLS)
    args=parser.parse_args()
    if not 0<=args.limit<=MAX_CALLS:
        parser.error('limit must be between 0 and 50')
    try:
        with connect() as db:
            result=run(db,args.limit,args.enqueue_only)
        print(json.dumps(result),flush=True)
        raise SystemExit(0 if result['status'] in ('ok','already_running','enqueued_only') else 1)
    except Exception as exc:
        print(json.dumps({'status':'failed','error_type':type(exc).__name__}),flush=True)
        raise SystemExit(1)
