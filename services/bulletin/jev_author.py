"""Policy-checked public author context for Jev value calibration."""
import datetime as dt
import json
import os
import re
import urllib.parse
import urllib.request


def _get(path, params):
    base = os.environ['CLICKHOUSE_ANALYTICS_API_URL'].rstrip('/')
    url = base + '/' + path + '?' + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={
        'Authorization': 'Bearer ' + os.environ['CLICKHOUSE_ANALYTICS_API_TOKEN']})
    with urllib.request.urlopen(request, timeout=40) as response:
        return json.load(response)


def _time(value):
    when = dt.datetime.fromisoformat(value.replace(' ', 'T').replace('Z', '+00:00'))
    return when if when.tzinfo else when.replace(tzinfo=dt.timezone.utc)


def context(db, account_id, username, now):
    """Missing public profile/posts reduce context; they never authorize a tweet."""
    profile = db.execute('''SELECT account_id,username,account_display_name,bio,website,
        location,num_followers FROM public.user_directory WHERE account_id=%s''',
        (account_id,)).fetchone()
    if not profile:
        return {'username': username, 'representative_posts': []}
    author = {k: profile.get(k) for k in ('username','account_display_name','bio','website','location','num_followers')}
    links = [author['website']] if author.get('website') else []
    for url in re.findall(r'https?://[^\s<>]+', author.get('bio') or ''):
        url = url.rstrip('.,;:!?)')
        if url not in links:
            links.append(url)
    author['links'] = links[:8]
    posts, seen = [], set()
    start = now - dt.timedelta(days=365)
    try:
        for year in (now.year, now.year-1):
            response = _get('top-quotes', {'limit': 20, 'offset': 0, 'sort': 'quotes',
                'year': year, 'target_account_id': account_id, 'min_quote_count': 2,
                'exclude_self': 'true', 'target_ca_users_only': 'false',
                'quote_ca_users_only': 'true'})
            if (response.get('query') or {}).get('targetAccountId') != account_id:
                raise ValueError('banger_scope_mismatch')
            for post in response.get('data') or []:
                if post.get('accountId') != account_id or not post.get('fullText') or not post.get('tweetId'):
                    continue
                when = _time(post['createdAt'])
                if not start <= when <= now or post['tweetId'] in seen:
                    continue
                seen.add(post['tweetId'])
                posts.append({'id': post['tweetId'], 'text': post['fullText'][:500],
                    'posted_at': when.isoformat(), 'source': 'banger',
                    'quote_count': int(post.get('quoteCount') or 0),
                    'like_count': int(post.get('favoriteCount') or 0)})
        posts.sort(key=lambda p: (p['quote_count'], p['like_count']), reverse=True)
        posts = posts[:3]
        if len(posts) < 3:
            response = _get('user/' + urllib.parse.quote(account_id, safe=''), {'limit': 20})
            payload = response.get('data') or {}
            if (payload.get('account') or {}).get('accountId') != account_id:
                raise ValueError('user_scope_mismatch')
            for post in payload.get('topTweets') or []:
                if post.get('tweetId') in seen or not post.get('fullText') or post.get('replyToUsername'):
                    continue
                if post['fullText'].startswith('RT @'):
                    continue
                posts.append({'id': post['tweetId'], 'text': post['fullText'][:500],
                    'posted_at': post.get('createdAt'), 'source': 'most_liked',
                    'quote_count': None, 'like_count': int(post.get('favoriteCount') or 0)})
                if len(posts) == 3:
                    break
    except (OSError, ValueError, KeyError, TypeError):
        # Profile alone is still useful context; a gateway outage must not turn
        # a public author into an unscored or falsely rejected opportunity.
        posts = []
    author['representative_posts'] = posts
    return author
