#!/usr/bin/env python3
"""Build public/tube/videos.json for /tube (CA Tube).

Inputs, all produced by read-only queries (see README.md next to this file):
  rows.json   [{v: video id, t: tweet id, a: account id, c: epoch secs, f: likes, r: is reply}]
  accts.json  [{a: account id, u: username, n: display name}]
  meta.json   {video id: {title, channel, channel_url} | null}   (YouTube oEmbed)
  texts*.json [{t: tweet id, x: full text, ru: reply-to username, z: tombstone}]
  av.json     [{a: account id, p: avatar url}]
  replyids.json optional [{t: tweet id, rt: reply-to tweet id}]
  parents.json  optional [{t: reply tweet id, pt, pa, px, pf, pc: the parent tweet}]
  enrich/*.json  optional LLM fields from enrich.py

Writes <out dir>/videos.json (catalogue) and <out dir>/c/<shard>.json (per-video
summary and the archived tweets that shared it, loaded on the watch page).

Usage: python3 -I build-tube-data.py <dir with inputs> <out dir>
"""
import collections
import glob
import json
import math
import os
import sys

MIN_SHARERS = 2
NEIGHBORS = 12
COMMENTS = 30
SHARDS = 128


def shard(video_id):
    # Mirrored by tubeShard() in src/lib/tube.ts.
    h = 0
    for ch in video_id:
        h = (h * 31 + ord(ch)) % SHARDS
    return h


src, out = sys.argv[1], sys.argv[2]
rows = json.load(open(f'{src}/rows.json'))
accounts = {r['a']: r for r in json.load(open(f'{src}/accts.json'))}
avatars = {r['a']: r['p'] for r in json.load(open(f'{src}/av.json'))}
meta = json.load(open(f'{src}/meta.json'))
texts = {}
for f in glob.glob(f'{src}/texts*.json'):
    for t in json.load(open(f)):
        texts[t['t']] = t
reply_to = {}
if os.path.exists(f'{src}/replyids.json'):
    reply_to = {r['t']: r['rt'] for r in json.load(open(f'{src}/replyids.json'))}
parents = {}
if os.path.exists(f'{src}/parents.json'):
    parents = {p['t']: p for p in json.load(open(f'{src}/parents.json'))}
enriched = {}
for f in sorted(glob.glob(f'{src}/enrich/*.json')):
    for e in json.load(open(f)):
        enriched[e['id']] = e
# curate.py merges free-text subcategories into a few per category.
if os.path.exists(f'{src}/submap.json'):
    submap = json.load(open(f'{src}/submap.json'))
    for e in enriched.values():
        e['sub'] = submap.get(e.get('cat'), {}).get(e.get('sub'), e.get('sub'))

by_video = collections.defaultdict(list)
for r in rows:
    t = texts.get(r['t'])
    if t and not t['z']:
        by_video[r['v']].append({**r, 'x': t['x'], 'ru': t['ru']})

videos = []
for vid, shares in by_video.items():
    sharers = {s['a'] for s in shares}
    m = meta.get(vid)
    if len(sharers) < MIN_SHARERS or not isinstance(m, dict) or not m.get('title'):
        continue
    shares.sort(key=lambda s: (not s['r'], s['f'] or 0), reverse=True)
    e = enriched.get(vid, {})
    stance = dict(zip([s['t'] for s in shares[:5]], e.get('stance') or []))
    comments = []
    for s in shares[:COMMENTS]:
        a = accounts.get(s['a'], {})
        comments.append({
            't': s['t'], 'u': a.get('u', ''), 'n': a.get('n', ''),
            'av': avatars.get(s['a'], ''), 'x': s['x'], 'f': s['f'] or 0,
            'c': s['c'], 'ru': s['ru'], 'st': stance.get(s['t']),
        })
        if s['t'] in reply_to:
            # Parents outside the archive are fetched from X at render time.
            comments[-1]['rt'] = reply_to[s['t']]
        p = parents.get(s['t'])
        if p:
            pa = accounts.get(p['pa'], {})
            comments[-1]['p'] = {
                't': p['pt'], 'u': pa.get('u', ''), 'n': pa.get('n', ''),
                'av': avatars.get(p['pa'], ''), 'x': p['px'], 'f': p['pf'] or 0, 'c': p['pc'],
            }
    v = {
        'id': vid,
        'title': m['title'],
        'channel': m.get('channel') or '',
        'sharers': sorted(sharers),
        'n': len(sharers),
        'likes': sum(s['f'] or 0 for s in shares),
        'first': min(s['c'] for s in shares),
        'last': max(s['c'] for s in shares),
        'comments': comments,
        'summary': e.get('summary'),
        'why': e.get('why'),
    }
    for key in ('type', 'cat', 'sub', 'tags'):
        if e.get(key):
            v[key] = e[key]
    if e.get('evergreen') is not None:
        v['ev'] = bool(e['evergreen'])
    videos.append(v)

# Item-item similarity from shared sharers. An account that posts hundreds of
# videos says less about any pair than one that posts a handful, so each
# account's contribution is down-weighted by how many videos it shared.
index = {v['id']: i for i, v in enumerate(videos)}
acct_videos = collections.defaultdict(list)
for i, v in enumerate(videos):
    for a in v['sharers']:
        acct_videos[a].append(i)
weight = {a: 1 / math.log(2 + len(vs)) for a, vs in acct_videos.items()}
norm = [math.sqrt(sum(weight[a] ** 2 for a in v['sharers'])) for v in videos]

for i, v in enumerate(videos):
    scores = collections.Counter()
    for a in v['sharers']:
        w = weight[a] ** 2
        for j in acct_videos[a]:
            if j != i:
                scores[j] += w
    ranked = sorted(scores.items(), key=lambda kv: kv[1] / (norm[i] * norm[kv[0]]), reverse=True)
    v['nb'] = [j for j, _ in ranked[:NEIGHBORS]]

details = collections.defaultdict(dict)
for v in videos:
    del v['sharers']
    details[shard(v['id'])][v['id']] = {
        'summary': v.pop('summary'), 'why': v.pop('why'), 'comments': v.pop('comments'),
    }
videos.sort(key=lambda v: (-v['n'], -v['likes']))
# Re-point neighbor indexes after sorting.
order = {v['id']: i for i, v in enumerate(videos)}
old = {i: vid for vid, i in index.items()}
for v in videos:
    v['nb'] = [order[old[j]] for j in v['nb']]

os.makedirs(f'{out}/c', exist_ok=True)
for k, d in details.items():
    json.dump(d, open(f'{out}/c/{k}.json', 'w'), ensure_ascii=False, separators=(',', ':'))
json.dump({'generated': max(v['last'] for v in videos), 'shards': SHARDS, 'videos': videos},
          open(f'{out}/videos.json', 'w'), ensure_ascii=False, separators=(',', ':'))

# Playlists: Claude-curated ones from curate.py when present, then lists
# derived from the data so the page is never empty.
ids = {v['id'] for v in videos}
playlists = []
if os.path.exists(f'{src}/playlists.json'):
    for p in json.load(open(f'{src}/playlists.json')):
        p['ids'] = [i for i in p['ids'] if i in ids]
        if len(p['ids']) >= 4:
            playlists.append(p)


def auto(pid, title, blurb, picked):
    if len(picked) >= 4:
        playlists.append({'id': pid, 'title': title, 'blurb': blurb,
                          'section': 'From the numbers', 'ids': [v['id'] for v in picked]})


auto('canon', 'The CA canon',
     'The videos the most different accounts in the archive have shared.', videos[:15])
auto('gems', 'Hidden gems',
     'Shared by only two or three accounts, and loved every time.',
     sorted([v for v in videos if v['n'] <= 3 and v['likes'] / v['n'] >= 20],
            key=lambda v: -v['likes'] / v['n'])[:15])
auto('lately', 'Shared lately',
     'The most shared videos among those posted in the last year.',
     sorted([v for v in videos if v['first'] >= max(x['last'] for x in videos) - 365 * 86400],
            key=lambda v: -v['n'])[:15])
for cat in sorted({v.get('cat') for v in videos if v.get('cat')}):
    auto('cat-' + ''.join(ch if ch.isalnum() else '-' for ch in cat.lower()).strip('-'),
         cat, f'The most shared videos in {cat}.',
         [v for v in videos if v.get('cat') == cat][:12])
json.dump(playlists, open(f'{out}/playlists.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print(f'{len(videos)} videos, {len(enriched)} enriched, {len(playlists)} playlists -> {out}')
