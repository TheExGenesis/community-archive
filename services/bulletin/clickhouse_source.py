"""Authenticated bounded ClickHouse gateway; no PostgreSQL tweet fallback."""
import datetime as dt
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request


def get(path, **params):
    base = os.environ['CLICKHOUSE_ANALYTICS_API_URL'].rstrip('/')
    token = os.environ['CLICKHOUSE_ANALYTICS_API_TOKEN']
    request = urllib.request.Request(base+'/'+path+'?'+urllib.parse.urlencode(params),
        headers={'Authorization':'Bearer '+token})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                result = json.load(response)
            break
        except urllib.error.HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504) or attempt == 2:
                raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if attempt == 2:
                raise
        time.sleep(2**attempt)
    if result.get('source') != 'clickhouse' or not isinstance(result.get('data'),list):
        raise RuntimeError('invalid_clickhouse_response')
    for row in result['data']:
        for key in ('created_at','updated_at'):
            if key in row:
                row[key] = dt.datetime.fromisoformat(row[key].replace(' ','T').replace('Z','+00:00'))
                if row[key].tzinfo is None:
                    row[key] = row[key].replace(tzinfo=dt.timezone.utc)
    return result


def page(start, end, after):
    return get('bulletin-tweets', start=start.isoformat(), end=end.isoformat(), after=after, limit=500)


def current(tweet_id):
    rows = get('bulletin-sources', ids=tweet_id)['data']
    return next((r for r in rows if r['tweet_id']==tweet_id and not r['reply_to_tweet_id']
        and not r['retweet'] and not r['full_text'].startswith('RT @')),None)
