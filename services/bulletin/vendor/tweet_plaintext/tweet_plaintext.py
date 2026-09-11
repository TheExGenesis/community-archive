#!/usr/bin/env python3
"""Fetch or load tweet context and print complete, attributed tweet blocks."""
from __future__ import annotations

import argparse
from collections import deque
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import time
import urllib.error
import urllib.request

import conversation_explorer as conversations
import image_describer

GATEWAY = 'https://analytics.community-archive.org/analytics'


def tweet_id(value):
    match = re.fullmatch(r'(?:https?://(?:www\.)?(?:x|twitter)\.com/[^/]+/status/)?(\d{1,20})(?:\?[^#]*)?', str(value))
    if not match:
        raise ValueError('Expected a tweet ID or x.com/twitter.com status URL')
    return match[1]


def load_env(path):
    """Read only this client's credential keys; never execute an env file."""
    wanted = {'GROQ_API_KEY', 'GROQ_VISION_MODEL', 'CLICKHOUSE_QUERY_GATEWAY_TOKEN',
              'CLICKHOUSE_ANALYTICS_API_TOKEN', 'CLICKHOUSE_ANALYTICS_API_URL'}
    for line in Path(path).expanduser().read_text().splitlines():
        key, sep, value = line.removeprefix('export ').partition('=')
        if sep and key.strip() in wanted:
            parts = shlex.split(value, comments=True)
            if parts:
                os.environ.setdefault(key.strip(), ' '.join(parts))


def gateway_token(ssh=None, identity=None):
    token = os.environ.get('CLICKHOUSE_QUERY_GATEWAY_TOKEN') or os.environ.get('CLICKHOUSE_ANALYTICS_API_TOKEN')
    if token:
        return token
    if not ssh:
        raise ValueError('Set CLICKHOUSE_QUERY_GATEWAY_TOKEN or use --gateway-ssh')
    if ssh.startswith('-'):
        raise ValueError('Invalid SSH host')
    # The root-only source stays remote; capture just this key into process memory.
    code = """import pathlib, shlex
for line in pathlib.Path('/etc/community-archive-query-gateway.env').read_text().splitlines():
 k,s,v=line.removeprefix('export ').partition('=')
 if s and k.strip()=='CLICKHOUSE_QUERY_GATEWAY_TOKEN':
  print(shlex.split(v, comments=True)[0]); break
else: raise SystemExit(1)
"""
    command = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10']
    if identity:
        command += ['-i', str(Path(identity).expanduser())]
    result = subprocess.run(command + [ssh, 'python3 -c ' + shlex.quote(code)],
                            capture_output=True, text=True, timeout=20)
    if result.returncode or not result.stdout.strip():
        raise RuntimeError('Cannot read gateway credential through SSH; check access and the gateway env source')
    return result.stdout.strip()


def fetch_context(seed, mode, token, base_url=GATEWAY):
    from urllib.parse import urlparse
    parsed = urlparse(base_url)
    if parsed.scheme != 'https' and not (parsed.scheme == 'http' and parsed.hostname in ('localhost', '127.0.0.1', '::1')):
        raise ValueError('Gateway must use HTTPS (or HTTP on loopback)')
    suffix = '' if mode == 'single' else '/thread?limit=500'
    request = urllib.request.Request(f'{base_url.rstrip("/")}/tweet/{tweet_id(seed)}{suffix}',
                                     headers={'Authorization': f'Bearer {token}'})
    # Do not forward a bearer token through an unexpected redirect.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None
    with urllib.request.build_opener(NoRedirect).open(request, timeout=45) as response:
        return json.load(response)


def normalize_payload(payload):
    """Adapt gateway detail/thread responses or portable snake_case records."""
    data = payload.get('data', payload) if isinstance(payload, dict) else payload
    query = payload.get('query', {}) if isinstance(payload, dict) else {}
    if isinstance(data, dict) and 'conversationTweets' in data:
        rows = data['conversationTweets']
    elif isinstance(data, dict) and 'tweet' in data:
        rows = [dict(data['tweet'], quotedTweet=data.get('quotedTweet'))]
    elif isinstance(data, dict) and 'records' in data:
        rows = data['records']
    elif isinstance(data, dict) and 'tweets' in data:
        rows = data['tweets']
    elif isinstance(data, list):
        rows = data
    elif isinstance(data, dict) and ('tweet_id' in data or 'tweetId' in data):
        rows = [data]
    elif isinstance(data, dict):
        rows = [dict(v, tweet_id=v.get('tweet_id', k)) for k, v in data.items()]
    else:
        raise ValueError('Expected tweet records or a gateway response')
    aliases = {'tweetId': 'tweet_id', 'fullText': 'full_text', 'createdAt': 'created_at',
               'replyToTweetId': 'reply_to_tweet_id', 'quoteTweetId': 'quoted_tweet_id',
               'favoriteCount': 'favorite_count', 'retweetCount': 'retweet_count',
               'accountId': 'account_id', 'accountDisplayName': 'account_display_name'}
    records, primary = {}, []
    def add(row):
        item = {aliases.get(k, k): v for k, v in row.items() if k != 'quotedTweet'}
        item = conversations.normalize_tweet(item)
        item['conversation_id'] = item.get('conversation_id') or query.get('conversationId') or 'loaded'
        # A complete primary record takes precedence over embedded quote hydration.
        previous = records.get(item['tweet_id'], {})
        records[item['tweet_id']] = {**item, **previous} if item['tweet_id'] in primary else item
        quoted = row.get('quotedTweet')
        if quoted:
            add(quoted)
        return item['tweet_id']
    for row in rows:
        ident = add(row)
        primary.append(ident)
    if isinstance(payload, dict) and 'primary_ids' in payload:
        primary = [str(i) for i in payload['primary_ids'] if str(i) in records]
    return records, list(dict.fromkeys(primary)), query


def select_context(records, primary, seed, mode='radius', radius=2, quotes=True):
    if seed not in primary:
        raise ValueError(f'Seed {seed} is unavailable in the supplied conversation')
    if radius < 0:
        raise ValueError('Radius cannot be negative')
    if mode == 'single':
        selected = {seed}
    else:
        trees = conversations.build_conversation_trees(records[i] for i in primary)
        tree = next(t for t in trees.values() if seed in t['nodes'])
        if mode == 'thread' and records[seed].get('conversation_id') != 'loaded':
            selected = set(tree['nodes'])
        else:
            # Undirected reply-edge radius includes siblings at distance two.
            neighbors = {i: [] for i in tree['nodes']}
            for child, parent in tree['parents'].items():
                neighbors[child].append(parent)
                neighbors[parent].append(child)
            selected, queue = {seed}, deque([(seed, 0)])
            while queue:
                node, distance = queue.popleft()
                if mode != 'thread' and distance >= radius:
                    continue
                for neighbor in sorted(neighbors[node]):
                    if neighbor not in selected:
                        selected.add(neighbor)
                        queue.append((neighbor, distance + 1))
    ordered = sorted(selected, key=lambda i: (str(records[i].get('created_at') or ''), i))
    missing_quotes = set()
    if quotes:
        # Exactly one quoted target per selected reply node, no recursive expansion.
        for ident in list(ordered):
            quote = records[ident].get('quoted_tweet_id')
            if quote and quote not in ordered:
                if quote in records:
                    ordered.append(quote)
                else:
                    missing_quotes.add(quote)
    return reply_order(records, ordered), sorted(missing_quotes)


def reply_order(records, ids):
    """Place included parents before replies, retaining stable order otherwise."""
    included, emitted, ordered = set(ids), set(), []
    for ident in ids:
        chain, seen = [], set()
        current = ident
        while current in included and current not in emitted and current not in seen:
            chain.append(current)
            seen.add(current)
            current = records[current].get('reply_to_tweet_id')
        for current in reversed(chain):
            emitted.add(current)
            ordered.append(current)
    return ordered


def render_context(records, ids, seed, *, descriptions=None, max_characters=50000, notes=()):
    """Keep the seed whole, print each node once, label relationships and omissions."""
    descriptions = descriptions or {}
    ids = reply_order(records, ids)
    blocks = []
    for ident in ids:
        tweet = records[ident]
        lines = [conversations.render_header_default(tweet) + (' [SEED]' if ident == seed else '')]
        for field, label in [('reply_to_tweet_id', 'Replies to'), ('quoted_tweet_id', 'Quotes')]:
            if tweet.get(field):
                target = tweet[field]
                lines.append(f'{label}: {target}' + (' [outside printed context]' if target not in ids else ''))
        lines.append(str(tweet.get('full_text') or '[text unavailable]'))
        for index, media in enumerate(tweet.get('media') or [], 1):
            url = media.get('mediaUrl') or media.get('media_url') or media.get('url')
            kind = media.get('mediaType') or media.get('media_type') or media.get('type') or 'unknown'
            desc = descriptions.get(ident, [])
            match = next((d for d in desc if d.get('image') == url), None)
            text = match['description'] if match else 'not described'
            lines.append(f'[Media {index}, {kind}] {url}\n[Image description, model-generated] {text}' if match else f'[Media {index}, {kind}; {text}] {url}')
        blocks.append('\n'.join(lines))
    header = f'TWEET CONTEXT — seed {seed}\nScope: available Community Archive / supplied records; not all of Twitter.\n'
    chosen, omitted = [], []
    # Reserve the seed's budget even when its ancestors are printed first.
    used_characters = len(header) + len(blocks[ids.index(seed)]) + 2
    for ident, block in zip(ids, blocks):
        if ident != seed and used_characters + len(block) + 2 > max_characters:
            omitted.append(ident)
        else:
            chosen.append(block)
            if ident != seed:
                used_characters += len(block) + 2
    footer = list(notes)
    if omitted:
        footer.append('Character budget omitted whole tweets: ' + ', '.join(omitted))
    if used_characters > max_characters:
        footer.append('Seed preserved whole even though it exceeds the character target.')
    text = header + '\n' + '\n\n'.join(chosen)
    if footer:
        text += '\n\nCONTEXT LIMITS\n' + '\n'.join('- ' + n for n in footer)
    # Edges must distinguish nodes dropped by the output budget too.
    for ident in omitted:
        text = text.replace(f'Replies to: {ident}\n', f'Replies to: {ident} [outside printed context]\n')
        text = text.replace(f'Quotes: {ident}\n', f'Quotes: {ident} [outside printed context]\n')
    return text + '\n', omitted


def describe_media(records, ids, *, max_images=4, model=None, max_tokens=3072):
    results, count = {}, 0
    for ident in ids:
        for media in records[ident].get('media') or []:
            kind = media.get('mediaType') or media.get('media_type') or media.get('type')
            url = media.get('mediaUrl') or media.get('media_url') or media.get('url')
            if kind != 'photo' or not url or count >= max_images:
                continue
            count += 1
            description = image_describer.describe_image(url, records[ident].get('full_text', ''),
                                                         model=model or image_describer.DEFAULT_MODEL, retries=1,
                                                         max_completion_tokens=max_tokens)
            results.setdefault(ident, []).append({'image': url, 'description': description,
                                                  'model': model or image_describer.DEFAULT_MODEL})
    return results


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('tweet', type=tweet_id)
    parser.add_argument('--mode', choices=['single', 'thread', 'radius'], default='radius')
    parser.add_argument('--radius', type=int, default=2)
    parser.add_argument('--no-quotes', action='store_true')
    parser.add_argument('--input', type=Path, help='Offline tweet JSON/JSONL or saved gateway response')
    parser.add_argument('--env-file', action='append', default=[])
    parser.add_argument('--gateway-url')
    parser.add_argument('--gateway-ssh', help='SSH host holding the root-only gateway env file')
    parser.add_argument('--identity', help='SSH identity file')
    parser.add_argument('--describe-images', action='store_true', help='Send selected photo URLs and tweet text to Groq')
    parser.add_argument('--max-images', type=int, default=4)
    parser.add_argument('--model')
    parser.add_argument('--image-max-tokens', type=int, default=3072)
    parser.add_argument('--images', type=Path, help='Existing description mapping; no model call')
    parser.add_argument('--max-characters', type=int, default=50000, help='Soft target; seed and completeness notes always survive')
    parser.add_argument('--output', type=Path)
    parser.add_argument('--json-output', type=Path, help='Save records, text, IDs, descriptions, and timings')
    args = parser.parse_args(argv)
    if args.radius < 0 or args.max_images < 0 or args.max_characters < 1 or args.image_max_tokens < 1:
        parser.error('Radius/images must be nonnegative and character target positive')
    if args.images and args.describe_images:
        parser.error('Use either --images or --describe-images')
    started = time.perf_counter()
    for env_file in args.env_file:
        load_env(env_file)
    if args.input:
        if args.input.suffix == '.jsonl':
            payload = [json.loads(line) for line in args.input.read_text().splitlines() if line.strip()]
        else:
            payload = json.loads(args.input.read_text())
    else:
        token = gateway_token(args.gateway_ssh, args.identity)
        payload = fetch_context(args.tweet, args.mode, token,
                                args.gateway_url or os.environ.get('CLICKHOUSE_ANALYTICS_API_URL') or GATEWAY)
    fetched = time.perf_counter()
    records, primary, query = normalize_payload(payload)
    ids, missing = select_context(records, primary, args.tweet, args.mode, args.radius, not args.no_quotes)
    notes = [f'Mode: {args.mode}' + (f'; reply-edge radius {args.radius} (quotes add one outgoing hop).' if args.mode == 'radius' else ('; thread means all returned conversation participants.' if args.mode == 'thread' else '; seed plus direct quoted target unless disabled.'))]
    if query.get('truncated'):
        notes.append('Gateway conversation limit reached (500 tweets); requested context may be incomplete.')
    if missing:
        notes.append('Quoted targets unavailable: ' + ', '.join(missing))
    absent_parents = sorted({records[i]['reply_to_tweet_id'] for i in ids if records[i].get('reply_to_tweet_id') and records[i]['reply_to_tweet_id'] not in records})
    if absent_parents:
        notes.append('Reply parents unavailable: ' + ', '.join(absent_parents))
    descriptions = json.loads(args.images.read_text()) if args.images else {}
    # Budget text first so excluded tweets do not cause paid image requests.
    _, omitted_before_images = render_context(records, ids, args.tweet, max_characters=args.max_characters)
    if args.describe_images:
        descriptions = describe_media(records, [args.tweet] + [i for i in ids if i != args.tweet and i not in omitted_before_images],
                                      max_images=args.max_images,
                                      model=args.model or os.environ.get('GROQ_VISION_MODEL'), max_tokens=args.image_max_tokens)
        notes.append(f'Photo description cap: {args.max_images}; remaining media explicitly marked not described.')
    described = time.perf_counter()
    text, omitted = render_context(records, ids, args.tweet, descriptions=descriptions,
                                   max_characters=args.max_characters, notes=notes)
    ended = time.perf_counter()
    timings = {'fetch_ms': round((fetched-started)*1000, 2), 'select_and_images_ms': round((described-fetched)*1000, 2),
               'render_ms': round((ended-described)*1000, 2), 'total_ms': round((ended-started)*1000, 2)}
    if args.json_output:
        args.json_output.write_text(json.dumps({'seed': args.tweet, 'text': text, 'selected_ids': ids,
            'omitted_ids': omitted, 'primary_ids': primary, 'query': query, 'records': list(records.values()),
            'image_descriptions': descriptions, 'timing': timings}, indent=2, ensure_ascii=False) + '\n')
    if args.output:
        args.output.write_text(text)
    else:
        print(text, end='')
    print(json.dumps(timings), file=sys.stderr)
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (ValueError, RuntimeError, OSError, subprocess.SubprocessError) as exc:
        print(f'tweet-plaintext: {exc}', file=sys.stderr)
        raise SystemExit(1)
