"""Conservative author-evidenced availability and bounded daily rechecks."""
import hashlib
import datetime as dt

import tweet_context

RULES = '''For every positive notice, also return an availability object, for example:
{"state":"unknown","tweet_id":null,"evidence":null}.
State must be exactly unknown, open, or resolved.
A resolved opportunity remains is_notice=true: it was a genuine ask or offer.
Use resolved only for an explicit statement from the seed's author that this
specific ask/offer is complete, filled, claimed, cancelled, or no longer available.
Use open only for an explicit author statement that it remains available or has
reopened. Use the latest applicable author update when statements conflict.
The evidence must be an exact substring of the seed or a visible descendant reply
by that same author, with its tweet_id. For unknown, both fields must be null.
A thank-you alone, someone offering help, interest, an answer from another person,
elapsed time, or silence does not establish resolution. Partial uptake does not
close remaining openings. Jokes, ambiguous gratitude, unrelated replies, and
quoted posts do not establish availability. Never guess that a request is done.'''


def digest(context):
    return hashlib.sha256(context.text.encode()).hexdigest()


def validate(value, seed, context):
    if not isinstance(value, dict) or value.get('state') not in ('unknown', 'open', 'resolved'):
        raise ValueError('invalid_availability')
    state, ident, evidence = value['state'], value.get('tweet_id'), value.get('evidence')
    if state == 'unknown':
        if ident is not None or evidence is not None:
            raise ValueError('unknown_availability_has_evidence')
        return dict(state=state, tweet_id=None, content_hash=None)
    row = context.records.get(ident) if isinstance(ident, str) else None
    if (not row or row['account_id'] != seed['account_id']
            or not isinstance(evidence, str) or not evidence.strip()
            or len(evidence) > 1000 or evidence not in row['full_text']):
        raise ValueError('availability_requires_exact_author_evidence')
    # A quote or unrelated post by the same author cannot close this notice.
    node, seen = ident, set()
    while node != seed['tweet_id']:
        if node in seen or node not in context.records:
            raise ValueError('availability_evidence_not_in_reply_tree')
        seen.add(node)
        node = context.records[node].get('reply_to_tweet_id')
    if row['created_at'] < seed['created_at']:
        raise ValueError('availability_evidence_predates_notice')
    return dict(state=state, tweet_id=ident,
        content_hash=context.sources[ident][1])


def enqueue_rechecks(db, started, max_seconds, current, clock):
    """Only daily runs revisit saved notices; all paid work uses the normal queue."""
    rows = db.execute('''SELECT o.tweet_id,o.context_digest,d.content_hash,
        o.standing,o.expires_at,o.side,d.posted_at
      FROM bulletin.opportunities o JOIN bulletin.decisions d USING(tweet_id)
      LEFT JOIN bulletin.refresh_requests r ON r.id=d.refresh_request_id
      WHERE d.status='positive'
        AND (d.refresh_request_id IS NULL OR r.status IN ('complete','stopped'))
        AND (o.context_checked_at IS NULL OR o.context_checked_at<date_trunc('day',now()))
      ORDER BY o.context_checked_at ASC NULLS FIRST,o.tweet_id''').fetchall()
    prepared = {}
    for row in rows:
        if clock()-started > max_seconds:
            raise RuntimeError('resolution_checks_time_limit')
        now = dt.datetime.now(dt.timezone.utc)
        if row['expires_at']:
            if row['expires_at'] < now.date():
                continue
        elif not row['standing']:
            duration = dt.timedelta(days=14 if row['side']=='ask' else 60)
            if row['posted_at']+duration <= now:
                # Self-quotes renew undated cards in the UI. Check that live
                # signal before skipping a notice whose original date is old.
                sources=tweet_context.clickhouse_source.get('bulletin-sources',ids=row['tweet_id'],enrich='true')['data']
                renewed=sources[0].get('renewed_at') if sources else None
                if not renewed or dt.datetime.fromisoformat(renewed.replace(' ','T').replace('Z','+00:00')).replace(tzinfo=dt.timezone.utc)+duration <= now:
                    continue
        seed = current(db, row['tweet_id'])
        if not seed or seed['content_hash'] != row['content_hash']:
            db.execute('DELETE FROM bulletin.decisions WHERE tweet_id=%s', (row['tweet_id'],))
            continue
        context = tweet_context.prepare(db, seed)
        with db.transaction():
            db.execute('UPDATE bulletin.opportunities SET context_checked_at=now() WHERE tweet_id=%s',
                (row['tweet_id'],))
            if digest(context) != row['context_digest']:
                db.execute('''UPDATE bulletin.decisions SET status='pending',attempts=0,refresh_request_id=NULL,
                  last_attempt_at=NULL,updated_at=now() WHERE tweet_id=%s''', (row['tweet_id'],))
                prepared[row['tweet_id']] = context
    return prepared
