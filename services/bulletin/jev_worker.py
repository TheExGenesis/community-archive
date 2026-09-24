# /// script
# requires-python = ">=3.11"
# dependencies = ["psycopg[binary]==3.2.9", "duckdb==1.5.5"]
# ///
"""Bounded, resumable Jev Bulletin worker. Shadow output until cutover."""
import argparse
import datetime as dt
from decimal import Decimal
import json
import os
import re
import time

from psycopg.types.json import Jsonb

import clickhouse_source
import jev_author
import jev_model as model
import resolution
import tweet_context
import worker

MAX_SECONDS = 900
MAX_PAGES = 100
MAX_CALLS = 400
MAX_RESOLUTION_CHECKS = 200
BATCH = {'disposition': 16, 'enrich': 3, 'value': 1}
WINDOW_DAYS = 2


def summary(text):
    # The original is one click away; this deterministic excerpt cannot invent
    # terms, dates, or locations. A richer summary can be added independently.
    return re.sub(r'\s+', ' ', text).strip()[:480] or '(empty post)'


def source_batch(ids):
    rows = clickhouse_source.get('bulletin-sources', ids=','.join(ids))['data']
    return {r['tweet_id']: r for r in rows if r['tweet_id'] in ids and
        not r.get('is_tombstone',False) and not r['reply_to_tweet_id'] and
        not r['retweet'] and not r['full_text'].startswith('RT @')}


def window_for(explicit):
    if explicit:
        return explicit
    end = dt.datetime.now(dt.timezone.utc).replace(hour=0,minute=0,second=0,microsecond=0)
    return end-dt.timedelta(days=WINDOW_DAYS),end


def scan(db, window, counts, started, rescan=False):
    start,end = window
    key = 'jev:'+start.isoformat()+':'+end.isoformat()
    db.execute('INSERT INTO bulletin.scans(scan_key,window_start,window_end) VALUES(%s,%s,%s) ON CONFLICT DO NOTHING',
        (key,start,end))
    if rescan:
        db.execute("UPDATE bulletin.scans SET cursor_id='0',complete=false WHERE scan_key=%s",(key,))
    state = db.execute('SELECT cursor_id,complete FROM bulletin.scans WHERE scan_key=%s',(key,)).fetchone()
    counts['scan_key'] = key
    counts['window_start'],counts['window_end'] = start.isoformat(),end.isoformat()
    if state['complete']:
        return True
    after = state['cursor_id']
    for _ in range(MAX_PAGES):
        if time.monotonic()-started > MAX_SECONDS:
            return False
        page = clickhouse_source.page(start,end,after)
        rows = page['data']
        allowed = {r['account_id'] for r in db.execute('SELECT account_id FROM bulletin.allowed_accounts')}
        originals = [r for r in rows if r['account_id'] in allowed and start <= r['created_at'] < end
            and not r['is_tombstone'] and not r['reply_to_tweet_id'] and not r['retweet']
            and not r['full_text'].startswith('RT @')]
        next_id = page['next']
        if page['scanned'] and (not next_id or int(next_id) <= int(after)):
            raise RuntimeError('invalid_clickhouse_cursor')
        with db.transaction():
            if originals:
                with db.cursor() as cursor:
                    cursor.executemany('''INSERT INTO bulletin.jev_items
                  (tweet_id,account_id,posted_at,content_hash,version) VALUES (%s,%s,%s,%s,%s)
                  ON CONFLICT(tweet_id) DO UPDATE SET
                    account_id=excluded.account_id,posted_at=excluded.posted_at,
                    content_hash=excluded.content_hash,version=excluded.version,
                    status='pending',phase='disposition',attempts=0,last_attempt_at=NULL,
                    disposition=NULL,enrichment=NULL,value_answer=NULL,p_opportunity=NULL,
                    p_direct=NULL,p_joke=NULL,value_score=NULL,side=NULL,kind=NULL,
                    summary=NULL,evidence=NULL,topics='{}',respond=NULL,standing=false,
                    expires_at=NULL,place=NULL,resolution_state='unknown',
                    resolution_tweet_id=NULL,resolution_content_hash=NULL,
                    context_digest=NULL,context_checked_at=NULL,updated_at=now()
                  WHERE bulletin.jev_items.content_hash IS DISTINCT FROM excluded.content_hash
                     OR bulletin.jev_items.version IS DISTINCT FROM excluded.version''',
                        [(r['tweet_id'],r['account_id'],r['created_at'],r['content_hash'],model.VERSION)
                            for r in originals])
            db.execute('UPDATE bulletin.scans SET cursor_id=%s,complete=%s,updated_at=now() WHERE scan_key=%s',
                (next_id or after,page['scanned']==0,key))
        counts['rows_seen'] += page['scanned']
        counts['eligible_originals'] += len(originals)
        if not page['scanned']:
            return True
        after = next_id
    return False


def reserve(db, ids, amount, run_id, backfill_budget):
    with db.transaction():
        spent = db.execute('''SELECT
          coalesce(sum(coalesce(c.actual_usd,c.reserved_usd)) FILTER
            (WHERE c.created_at>=date_trunc('day',now()) AND NOT coalesce(r.counts ? 'backfill_budget_usd',false)),0) AS day,
          coalesce(sum(coalesce(c.actual_usd,c.reserved_usd)),0) AS month
          FROM bulletin.calls c LEFT JOIN bulletin.runs r ON r.id=c.run_id
          WHERE c.created_at>=date_trunc('month',now())''').fetchone()
        if spent['month']+amount > worker.MONTH_BUDGET*Decimal('.9'):
            return None
        if backfill_budget is None:
            if spent['day']+amount > worker.DAY_BUDGET*Decimal('.9'):
                return None
        else:
            used = db.execute('''SELECT coalesce(sum(coalesce(c.actual_usd,c.reserved_usd)),0) AS spent
              FROM bulletin.calls c JOIN bulletin.runs r ON r.id=c.run_id
              WHERE r.counts->>'scan_key'=(SELECT counts->>'scan_key' FROM bulletin.runs WHERE id=%s)''',
              (run_id,)).fetchone()['spent']
            if used+amount > backfill_budget:
                return None
        call_id = db.execute('INSERT INTO bulletin.calls(reserved_usd,run_id) VALUES(%s,%s) RETURNING id',
            (amount,run_id)).fetchone()['id']
        if ids:
            db.execute('''UPDATE bulletin.jev_items SET attempts=attempts+1,last_attempt_at=now(),
              status='failed',updated_at=now() WHERE tweet_id=ANY(%s)''',(ids,))
    return call_id


def _valid_sources(db, jobs):
    sources = source_batch([j['tweet_id'] for j in jobs])
    allowed = {r['account_id']:r['username'] for r in db.execute(
        'SELECT account_id,username FROM bulletin.allowed_accounts WHERE account_id=ANY(%s)',
        ([j['account_id'] for j in jobs],))}
    valid = []
    for job in jobs:
        source = sources.get(job['tweet_id'])
        if (source and source['account_id']==job['account_id'] and
                source['content_hash']==job['content_hash'] and source['account_id'] in allowed):
            source['username'] = allowed[source['account_id']]
            valid.append((job,source))
        else:
            db.execute('DELETE FROM bulletin.jev_items WHERE tweet_id=%s',(job['tweet_id'],))
    return valid


def _publish(db, job, source, phase, answer):
    tweet_id = job['tweet_id']
    if phase == 'disposition':
        d = answer['disposition']
        p = min(1,d['probabilities']['ask']+d['probabilities']['offer'])
        choice = max(('ask','offer'),key=lambda s:d['probabilities'][s])
        db.execute('''UPDATE bulletin.jev_items SET disposition=%s,p_opportunity=%s,
          side=%s,status=%s,phase='enrich',attempts=0,last_attempt_at=NULL,updated_at=now()
          WHERE tweet_id=%s''', (Jsonb(answer),p,choice,
              'pending' if p>=model.OPPORTUNITY_MIN else 'rejected',tweet_id))
    elif phase == 'enrich':
        direct = answer['direct_action']['noul']
        db.execute('''UPDATE bulletin.jev_items SET enrichment=%s,p_direct=%s,
          kind=%s,respond=%s,standing=%s,topics=%s,status=%s,phase='value',
          attempts=0,last_attempt_at=NULL,updated_at=now() WHERE tweet_id=%s''',
          (Jsonb(answer),direct,answer['kind']['choice'],answer['respond']['choice'],
            answer['standing']['noul']>=.5,
            [tag for tag in model.TOPICS if answer['tag_'+tag]['noul']>=.5][:6],
            'pending' if direct>=model.DIRECT_MIN else 'rejected',tweet_id))
    else:
        p_joke,score = answer['joke']['noul'],answer['value']['score']
        disposition,enrichment = job['disposition'],job['enrichment']
        # Reuse the same threshold function for replay and steady state.
        ready = model.passes(disposition,enrichment,answer)
        db.execute('''UPDATE bulletin.jev_items SET value_answer=%s,p_joke=%s,value_score=%s,
          status=%s,summary=%s,evidence=%s,updated_at=now() WHERE tweet_id=%s''',
          (Jsonb(answer),p_joke,score,'ready' if ready else 'rejected',
            summary(source['full_text']) if ready else None,
            source['full_text'][:200] if ready else None,tweet_id))


def process(db, run_id, window, prompt, counts, started, limit, backfill_budget, key):
    start,end = window
    author_cache = {}
    for phase in BATCH:
        while counts['calls'] < limit and time.monotonic()-started < MAX_SECONDS:
            retry_wait = dt.timedelta(minutes=1 if backfill_budget is not None else 60)
            jobs = db.execute('''SELECT * FROM bulletin.jev_items WHERE version=%s AND phase=%s
              AND status IN ('pending','failed') AND attempts<3 AND posted_at >= %s AND posted_at < %s
              AND (last_attempt_at IS NULL OR last_attempt_at<now()-%s)
              ORDER BY updated_at,tweet_id LIMIT %s''',
              (model.VERSION,phase,start,end,retry_wait,BATCH[phase])).fetchall()
            if not jobs:
                break
            valid = _valid_sources(db,jobs)
            if not valid:
                counts['suppressed'] += len(jobs)
                continue
            jobs,sources = zip(*valid)
            if phase == 'value':
                job,source = jobs[0],sources[0]
                author = author_cache.get(job['account_id'])
                if author is None:
                    author = jev_author.context(db,job['account_id'],source['username'],
                        dt.datetime.now(dt.timezone.utc))
                    author_cache[job['account_id']] = author
                payload = model.value_payload(source,job['side'],author)
            else:
                payload = model.batch_payload(sources,phase,prompt)
                while len(json.dumps(payload,ensure_ascii=False).encode())>100_000 and len(jobs)>1:
                    jobs,sources=jobs[:len(jobs)//2],sources[:len(sources)//2]
                    payload=model.batch_payload(sources,phase,prompt)
            if len(json.dumps(payload,ensure_ascii=False).encode())>100_000:
                db.execute('''UPDATE bulletin.jev_items SET status='failed',attempts=3,
                  updated_at=now() WHERE tweet_id=%s''',(jobs[0]['tweet_id'],))
                counts['failed']+=1
                continue
            amount = model.reservation(payload)
            if amount > Decimal('.01'):
                raise ValueError('oversize_jev_request')
            for retry in range(3):
                attempt = max(j['attempts'] for j in jobs) + retry + 1
                call_id = reserve(db,[j['tweet_id'] for j in jobs],amount,run_id,backfill_budget)
                if call_id is None:
                    return 'budget_limit'
                counts['calls'] += 1
                stage = 'model_request'
                try:
                    response = model.call(payload,key)
                    stage = 'model_validation'
                    answers,cost = model.validate(response,payload,None if phase=='value' else jobs,phase)
                    db.execute("UPDATE bulletin.calls SET actual_usd=%s,status='responded' WHERE id=%s",(cost,call_id))
                    stage = 'publish'
                    answers = [answers] if phase=='value' else answers
                    # Consent, source state and text hash can change during a call.
                    fresh = {j['tweet_id']:(j,s) for j,s in _valid_sources(db,jobs)}
                    with db.transaction():
                        for job,answer in zip(jobs,answers):
                            pair = fresh.get(job['tweet_id'])
                            if not pair:
                                counts['suppressed'] += 1
                                continue
                            _publish(db,job,pair[1],phase,answer)
                            if phase == 'value':
                                counts['positive' if model.passes(job['disposition'],job['enrichment'],answer)
                                       else 'negative'] += 1
                        db.execute("UPDATE bulletin.calls SET status='validated' WHERE id=%s",(call_id,))
                    break
                except Exception as exc:
                    delay = worker.retry_wait(exc,attempt) if stage in ('model_request','model_validation') else None
                    if delay is not None and (counts['calls']>=limit or
                            time.monotonic()-started+delay+60>MAX_SECONDS):
                        delay = None
                    worker.log_failure(exc,run_id=run_id,call_id=call_id,attempt=attempt,
                        stage=stage,retry_seconds=delay)
                    db.execute('UPDATE bulletin.calls SET status=%s WHERE id=%s',
                        ('failed:'+type(exc).__name__,call_id))
                    counts['failed'] += len(jobs)
                    if delay is None:
                        return 'classification_failed'
                    time.sleep(delay)
    return 'ok'


def _author_replies(seed, context):
    """Only visible descendant replies by the seed author can change status."""
    replies=[]
    for ident,row in context.records.items():
        if ident==seed['tweet_id'] or row['account_id']!=seed['account_id']:
            continue
        node,seen=ident,set()
        while node!=seed['tweet_id'] and node in context.records and node not in seen:
            seen.add(node)
            node=context.records[node].get('reply_to_tweet_id')
        if node==seed['tweet_id'] and row['created_at']>=seed['created_at']:
            replies.append(row)
    return sorted(replies,key=lambda r:int(r['tweet_id']))


def check_resolutions(db, run_id, counts, started, limit, key):
    """Recheck current author reply evidence without reclassifying the seed."""
    rows=db.execute('''SELECT * FROM bulletin.jev_items WHERE status='ready'
      AND (context_checked_at IS NULL OR context_checked_at<date_trunc('day',now()))
      AND (standing OR posted_at>=now()-interval '75 days')
      ORDER BY context_checked_at ASC NULLS FIRST,tweet_id LIMIT %s''',
      (MAX_RESOLUTION_CHECKS,)).fetchall()
    checked=0
    for job in rows:
        if time.monotonic()-started>MAX_SECONDS or counts['calls']>=limit:
            break
        valid=_valid_sources(db,[job])
        if not valid:
            counts['suppressed']+=1
            continue
        seed=valid[0][1]
        call_id=None
        try:
            context=tweet_context.prepare(db,seed)
            digest=resolution.digest(context)
            replies=_author_replies(seed,context)
            if digest==job['context_digest'] or not replies:
                if tweet_context.still_current(db,context):
                    db.execute('''UPDATE bulletin.jev_items SET context_digest=%s,
                      context_checked_at=now() WHERE tweet_id=%s''',(digest,job['tweet_id']))
                    checked+=1
                continue
            payload=model.availability_payload(seed,replies)
            amount=model.reservation(payload)
            if amount>Decimal('.01'):
                raise ValueError('oversize_jev_resolution_request')
            call_id=reserve(db,[],amount,run_id,None)
            if call_id is None:
                counts['resolution_checked']=checked
                return 'budget_limit'
            counts['calls']+=1
            response=model.call(payload,key)
            answers,cost=model.validate(response,payload)
            db.execute("UPDATE bulletin.calls SET actual_usd=%s,status='responded' WHERE id=%s",(cost,call_id))
            update=None
            for i,row in enumerate(replies):
                answer=answers['reply_'+str(i)]
                choice=answer['choice']
                if choice=='neither' or answer['probabilities'][choice]<.8:
                    continue
                candidate=resolution.validate({'state':choice,'tweet_id':row['tweet_id'],
                    'evidence':row['full_text'][:1000]},seed,context)
                if not update or int(candidate['tweet_id'])>int(update['tweet_id']):
                    update=candidate
            if not tweet_context.still_current(db,context):
                db.execute("UPDATE bulletin.calls SET status='suppressed' WHERE id=%s",(call_id,))
                counts['suppressed']+=1
                continue
            with db.transaction():
                if update and (not job['resolution_tweet_id'] or
                        int(update['tweet_id'])>=int(job['resolution_tweet_id'])):
                    db.execute('''UPDATE bulletin.jev_items SET resolution_state=%s,
                      resolution_tweet_id=%s,resolution_content_hash=%s WHERE tweet_id=%s''',
                      (update['state'],update['tweet_id'],update['content_hash'],job['tweet_id']))
                db.execute('''UPDATE bulletin.jev_items SET context_digest=%s,
                  context_checked_at=now() WHERE tweet_id=%s''',(digest,job['tweet_id']))
                db.execute("UPDATE bulletin.calls SET status='validated' WHERE id=%s",(call_id,))
            checked+=1
        except Exception as exc:
            worker.log_failure(exc,run_id=run_id,stage='resolution_recheck')
            if call_id is not None:
                db.execute('UPDATE bulletin.calls SET status=%s WHERE id=%s',
                    ('failed:'+type(exc).__name__,call_id))
            counts['failed']+=1
            return 'resolution_failed'
    counts['resolution_checked']=checked
    pending=db.execute('''SELECT count(*) n FROM bulletin.jev_items WHERE status='ready'
      AND (context_checked_at IS NULL OR context_checked_at<date_trunc('day',now()))
      AND (standing OR posted_at>=now()-interval '75 days')''').fetchone()['n']
    counts['resolution_pending']=pending
    return 'resolution_backlog' if pending else 'ok'


def run(db, *, window=None, rescan=False, enqueue_only=False,
        backfill_budget=None, limit=MAX_CALLS):
    if backfill_budget is not None and (window is None or not Decimal(0)<backfill_budget<=Decimal(1)):
        raise ValueError('backfill_budget_requires_window_and_at_most_one_dollar')
    if not db.execute('SELECT pg_try_advisory_lock(%s) AS locked',(worker.LOCK,)).fetchone()['locked']:
        return {'status':'already_running'}
    started = time.monotonic()
    explicit_window = window is not None
    window = window_for(window)
    counts = dict(rows_seen=0,eligible_originals=0,calls=0,positive=0,negative=0,failed=0,suppressed=0)
    if backfill_budget is not None:
        counts['backfill_budget_usd'] = str(backfill_budget)
    run_id = None
    active = 'legacy'
    try:
        active = db.execute('SELECT active FROM bulletin.pipeline_state WHERE id=1').fetchone()['active']
        prompt = db.execute('SELECT id,body FROM bulletin.prompt_versions ORDER BY id DESC LIMIT 1').fetchone()
        if not prompt:
            raise RuntimeError('missing_active_prompt')
        run_id = db.execute('''INSERT INTO bulletin.runs(model,classifier_version,prompt_version_id,counts)
          VALUES(%s,%s,%s,%s) RETURNING id''',
          (model.MODEL,model.VERSION,prompt['id'],Jsonb(counts))).fetchone()['id']
        if active=='jev':
            db.execute('''UPDATE bulletin.worker_state SET last_started_at=now(),
              last_finished_at=NULL,status='running',counts=%s WHERE id=1''',(Jsonb(counts),))
        # Purge private derived data when transactional policy changes.
        db.execute('''DELETE FROM bulletin.jev_items j WHERE NOT EXISTS
          (SELECT 1 FROM bulletin.allowed_accounts a WHERE a.account_id=j.account_id)''')
        complete = scan(db,window,counts,started,rescan)
        status = 'enqueued_only' if enqueue_only else 'intake_backlog' if not complete else 'ok'
        if complete and not enqueue_only:
            key = os.environ.get('OPENROUTER_API_KEY')
            if not key:
                raise RuntimeError('missing_model_key')
            work_window = window if explicit_window else (window[1]-dt.timedelta(days=14),window[1])
            status = process(db,run_id,work_window,prompt['body'],counts,started,limit,backfill_budget,key)
            if status=='ok' and not explicit_window:
                resolution_status=check_resolutions(db,run_id,counts,started,limit,key)
                if resolution_status!='ok':
                    status=resolution_status
            pending = db.execute('''SELECT count(*) n,
              count(*) FILTER (WHERE attempts<3) retryable FROM bulletin.jev_items WHERE version=%s
              AND posted_at >= %s AND posted_at < %s AND status IN ('pending','failed')''',
              (model.VERSION,*work_window)).fetchone()
            counts['pending'] = pending['n']
            counts['retryable'] = pending['retryable']
            if pending['n'] and status=='ok':
                status = 'pending_review' if pending['retryable'] else 'classification_failed'
        db.execute('UPDATE bulletin.runs SET status=%s,counts=%s,finished_at=now() WHERE id=%s',
            (status,Jsonb(counts),run_id))
        if active=='jev':
            db.execute('''UPDATE bulletin.worker_state SET counts=%s,status=%s,
              last_finished_at=now(),
              last_success_at=CASE WHEN %s='ok' THEN now() ELSE last_success_at END WHERE id=1''',
              (Jsonb(counts),status,status))
        return {'status':status,**counts}
    except Exception:
        if run_id:
            db.execute("UPDATE bulletin.runs SET status='failed',counts=%s,finished_at=now() WHERE id=%s",
                (Jsonb(counts),run_id))
            if active=='jev':
                db.execute("UPDATE bulletin.worker_state SET status='failed',last_finished_at=now() WHERE id=1")
        raise
    finally:
        db.execute('SELECT pg_advisory_unlock(%s)',(worker.LOCK,))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--start',type=dt.date.fromisoformat)
    parser.add_argument('--end',type=dt.date.fromisoformat)
    parser.add_argument('--rescan',action='store_true')
    parser.add_argument('--enqueue-only',action='store_true')
    parser.add_argument('--limit',type=int,default=MAX_CALLS)
    parser.add_argument('--backfill-budget-usd',type=Decimal)
    args = parser.parse_args()
    if bool(args.start) != bool(args.end):
        parser.error('start and end must be provided together')
    explicit = (dt.datetime.combine(args.start,dt.time.min,dt.timezone.utc),
        dt.datetime.combine(args.end,dt.time.min,dt.timezone.utc)) if args.start else None
    if explicit and not dt.timedelta(0)<explicit[1]-explicit[0]<=dt.timedelta(days=15):
        parser.error('window must be 1–15 days')
    if not 0 <= args.limit <= MAX_CALLS:
        parser.error('limit must be between 0 and 400')
    with worker.connect() as database:
        result = run(database,window=explicit,rescan=args.rescan,
            enqueue_only=args.enqueue_only,backfill_budget=args.backfill_budget_usd,
            limit=args.limit)
        print(json.dumps(result),flush=True)
        raise SystemExit(0 if result['status'] in ('ok','already_running','enqueued_only') else 1)
