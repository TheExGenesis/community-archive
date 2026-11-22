"""Ask the website to title the board's untitled notices after a run.

The website owns the title prompt (the one a tweet's archive page uses), so
the worker only triggers it. Failures never change the run's outcome: cards
keep showing the post's text until a later run titles them.
"""
import json
import os
import time
import urllib.error
import urllib.request

PER_REQUEST = 12
MAX_REQUESTS = 15
# About a minute of generation per request. A request that outlives this still
# finishes and stores its titles on the website.
REQUEST_TIMEOUT = 150


def _post(url, secret, limit):
    request = urllib.request.Request(url, method='POST',
        data=json.dumps({'limit': limit}).encode(),
        headers={'Authorization': 'Bearer '+secret, 'Content-Type': 'application/json',
            'User-Agent': 'community-archive-bulletin'})
    with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT) as response:
        return json.load(response)


def request_titles(deadline, *, post=_post, clock=time.monotonic, env=os.environ):
    """Repeat bounded requests until nothing is left or `deadline` is near."""
    url, secret = env.get('BULLETIN_TITLES_URL'), env.get('BULLETIN_TITLES_SECRET')
    if not url or not secret:
        return {'status': 'not_configured'}
    totals = dict(requests=0, titled=0, untitled=0, failed=0, remaining=None)
    status = 'ok'
    while totals['requests'] < MAX_REQUESTS:
        if clock()+REQUEST_TIMEOUT > deadline:
            status = 'out_of_time'
            break
        try:
            result = post(url, secret, PER_REQUEST)
        except (urllib.error.URLError, TimeoutError, ConnectionError, ValueError) as error:
            # Status code or exception class only: never a response body.
            status = 'error_'+str(getattr(error, 'code', type(error).__name__))
            break
        totals['requests'] += 1
        for key in ('titled', 'untitled', 'failed'):
            totals[key] += int(result.get(key) or 0)
        totals['remaining'] = int(result.get('remaining') or 0)
        if not totals['remaining'] or not result.get('attempted'):
            break
    else:
        status = 'request_limit'
    return {'status': status, **totals}
