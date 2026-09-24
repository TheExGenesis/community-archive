# /// script
# requires-python = ">=3.11"
# dependencies = ["psycopg[binary]==3.2.9", "duckdb==1.5.5"]
# ///
"""Preflight or import the September 9–23 local Jev replay into shadow state.

The default is read-only. --apply writes only bulletin.jev_items, never the live
legacy decisions or active pipeline switch. On the worker host, use
run_jev_import_service.py after the separately approved backfill step.
"""
import argparse
from collections import Counter
import datetime as dt
import json
from pathlib import Path
import sqlite3

from psycopg.types.json import Jsonb

import clickhouse_source
import jev_model as model
import jev_worker
import worker

START = dt.datetime(2026,9,9,tzinfo=dt.timezone.utc)
END = dt.datetime(2026,9,23,tzinfo=dt.timezone.utc)
REPLAY_VERSION = 'bulletin-jev-snapshot-v1'


def load(root):
    source = sqlite3.connect(root/'snapshot.sqlite'); source.row_factory=sqlite3.Row
    jev = sqlite3.connect(root/'jev.sqlite'); jev.row_factory=sqlite3.Row
    value = sqlite3.connect(root/'value.sqlite'); value.row_factory=sqlite3.Row
    answers = {}
    for row in jev.execute('SELECT id,phase,answer FROM results'):
        answers.setdefault(row['id'],{})[row['phase']] = json.loads(row['answer'])
    for row in value.execute("SELECT id,answer FROM results WHERE status='ok'"):
        answers.setdefault(row['id'],{})['value'] = json.loads(row['answer'])
    baseline = {r['id']:dict(r) for r in source.execute('SELECT * FROM baseline')}
    rows = []
    for tweet in source.execute('SELECT * FROM tweets ORDER BY id'):
        posted = dt.datetime.fromisoformat(tweet['posted_at'].replace('Z','+00:00'))
        if not START <= posted < END:
            raise ValueError('snapshot_outside_approved_window')
        item = answers.get(tweet['id'])
        if not item or 'disposition' not in item:
            raise ValueError('incomplete_disposition')
        d = item['disposition']; probs=d['disposition']['probabilities']
        p = probs['ask']+probs['offer']
        e = item.get('enrich'); direct=item.get('verify'); v=item.get('value')
        if p >= model.OPPORTUNITY_MIN and (not e or not direct or not v):
            raise ValueError('incomplete_positive_candidate')
        side=max(('ask','offer'),key=lambda s:probs[s])
        if p < model.OPPORTUNITY_MIN:
            ready=False
        else:
            combined={**e,**direct}
            ready=model.passes(d,combined,v)
        old=baseline.get(tweet['id']) or {}
        old_summary=old.get('summary') if old.get('content_hash')==tweet['content_hash'] else None
        old_evidence=old.get('evidence') if old.get('content_hash')==tweet['content_hash'] else None
        rows.append(dict(tweet_id=tweet['id'],account_id=tweet['account_id'],posted_at=posted,
            content_hash=tweet['content_hash'],text=tweet['text'],disposition=d,
            enrichment={**e,**direct} if e and direct else None,value_answer=v,
            p_opportunity=min(1,p),p_direct=direct['direct_action']['noul'] if direct else None,
            p_joke=v['joke']['noul'] if v else None,value_score=v['value']['score'] if v else None,
            side=side,kind=e['kind']['choice'] if e else None,
            respond=e['respond']['choice'] if e else None,
            standing=e['standing']['noul']>=.5 if e else False,
            topics=[tag for tag in model.TOPICS if e and e['tag_'+tag]['noul']>=.5][:6],
            summary=(old_summary or jev_worker.summary(tweet['text'])) if ready else None,
            evidence=(old_evidence if old_evidence and old_evidence in tweet['text'] else tweet['text'][:200]) if ready else None,
            status='ready' if ready else 'rejected'))
    return rows


def apply(db, rows):
    if not db.execute('SELECT pg_try_advisory_lock(%s) AS locked',(worker.LOCK,)).fetchone()['locked']:
        raise RuntimeError('bulletin_worker_running')
    try:
        if db.execute('SELECT active FROM bulletin.pipeline_state WHERE id=1').fetchone()['active'] != 'legacy':
            raise RuntimeError('import_requires_legacy_shadow')
        allowed={r['account_id'] for r in db.execute('SELECT account_id FROM bulletin.allowed_accounts')}
        # Source recheck is mandatory for anything that could enter the board.
        ready=[r for r in rows if r['status']=='ready' and r['account_id'] in allowed]
        live={}
        for i in range(0,len(ready),16):
            live.update(jev_worker.source_batch([r['tweet_id'] for r in ready[i:i+16]]))
        counts=Counter()
        for i in range(0,len(rows),250):
            with db.transaction():
                for row in rows[i:i+250]:
                    if row['account_id'] not in allowed:
                        counts['policy_skipped']+=1;continue
                    if row['status']=='ready':
                        source=live.get(row['tweet_id'])
                        if not source or source['account_id']!=row['account_id'] or source['content_hash']!=row['content_hash']:
                            counts['source_skipped']+=1;continue
                    db.execute('''INSERT INTO bulletin.jev_items
                      (tweet_id,account_id,posted_at,content_hash,version,status,phase,disposition,
                       enrichment,value_answer,p_opportunity,p_direct,p_joke,value_score,side,kind,
                       summary,evidence,topics,respond,standing)
                      VALUES (%s,%s,%s,%s,%s,%s,'value',%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                      ON CONFLICT(tweet_id) DO UPDATE SET
                        account_id=excluded.account_id,posted_at=excluded.posted_at,
                        content_hash=excluded.content_hash,version=excluded.version,status=excluded.status,
                        phase=excluded.phase,disposition=excluded.disposition,enrichment=excluded.enrichment,
                        value_answer=excluded.value_answer,p_opportunity=excluded.p_opportunity,
                        p_direct=excluded.p_direct,p_joke=excluded.p_joke,value_score=excluded.value_score,
                        side=excluded.side,kind=excluded.kind,summary=excluded.summary,evidence=excluded.evidence,
                        topics=excluded.topics,respond=excluded.respond,standing=excluded.standing,updated_at=now()
                      WHERE bulletin.jev_items.version<>excluded.version
                         OR bulletin.jev_items.content_hash<>excluded.content_hash''',
                      (row['tweet_id'],row['account_id'],row['posted_at'],row['content_hash'],REPLAY_VERSION,
                       row['status'],Jsonb(row['disposition']),Jsonb(row['enrichment']) if row['enrichment'] else None,
                       Jsonb(row['value_answer']) if row['value_answer'] else None,row['p_opportunity'],
                       row['p_direct'],row['p_joke'],row['value_score'],row['side'],row['kind'],
                       row['summary'],row['evidence'],row['topics'],row['respond'],row['standing']))
                    counts[row['status']]+=1
        return dict(counts)
    finally:
        db.execute('SELECT pg_advisory_unlock(%s)',(worker.LOCK,))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot-dir',type=Path,required=True)
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args()
    rows=load(args.snapshot_dir)
    print(json.dumps({'snapshot_rows':len(rows),'ready':sum(r['status']=='ready' for r in rows),
        'window':[START.isoformat(),END.isoformat()], 'version':REPLAY_VERSION}),flush=True)
    if args.apply:
        with worker.connect() as database:
            print(json.dumps({'imported':apply(database,rows)}),flush=True)
