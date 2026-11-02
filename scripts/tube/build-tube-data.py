#!/usr/bin/env python3
"""Build public/tube/videos.json for /tube (CA Tube).

Inputs, all produced by read-only queries (see README.md next to this file):
  rows.json   [{v: video id, t: tweet id, a: account id, c: epoch secs, f: likes, r: is reply}]
  accts.json  [{a: account id, u: username, n: display name}]
  meta.json   {video id: {title, channel, channel_url} | null}   (YouTube oEmbed)

Usage: python3 -I build-tube-data.py <dir with inputs> <output json>
"""
import collections
import json
import math
import sys

MIN_SHARERS = 2
NEIGHBORS = 12
EXAMPLES = 3

src, out = sys.argv[1], sys.argv[2]
rows = json.load(open(f'{src}/rows.json'))
names = {r['a']: r['u'] for r in json.load(open(f'{src}/accts.json'))}
meta = json.load(open(f'{src}/meta.json'))

by_video = collections.defaultdict(list)
for r in rows:
    by_video[r['v']].append(r)

videos = []
for vid, shares in by_video.items():
    sharers = {s['a'] for s in shares}
    m = meta.get(vid)
    if len(sharers) < MIN_SHARERS or not isinstance(m, dict) or not m.get('title'):
        continue
    # One example per account: its most-liked share, originals before replies.
    best = {}
    for s in shares:
        key = (not s['r'], s['f'])
        if s['a'] not in best or key > best[s['a']][0]:
            best[s['a']] = (key, s)
    examples = sorted(best.values(), key=lambda x: x[0], reverse=True)[:EXAMPLES]
    videos.append({
        'id': vid,
        'title': m['title'],
        'channel': m.get('channel') or '',
        'sharers': sorted(sharers),
        'n': len(sharers),
        'likes': sum(s['f'] or 0 for s in shares),
        'first': min(s['c'] for s in shares),
        'last': max(s['c'] for s in shares),
        'ex': [[s['t'], names.get(s['a'], ''), s['f'] or 0] for _, s in examples],
    })

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

for v in videos:
    del v['sharers']
videos.sort(key=lambda v: (-v['n'], -v['likes']))
# Re-point neighbor indexes after sorting.
order = {v['id']: i for i, v in enumerate(videos)}
old = {i: vid for vid, i in index.items()}
for v in videos:
    v['nb'] = [order[old[j]] for j in v['nb']]

json.dump({'generated': max(v['last'] for v in videos), 'videos': videos},
          open(out, 'w'), ensure_ascii=False, separators=(',', ':'))
print(f'{len(videos)} videos -> {out}')
