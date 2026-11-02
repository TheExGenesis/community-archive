#!/usr/bin/env python3
"""LLM enrichment for CA Tube via batched `claude -p` calls.

Usage: python3 -I enrich.py <scratch dir> <videos.json> [--limit N]
Reads rows.json and texts*.json from the scratch dir; writes enrich/<batch>.json
there (resumable: finished batches are skipped).
"""
import concurrent.futures
import glob
import json
import os
import subprocess
import sys

BATCH = 40
PARALLEL = 6
CATEGORIES = [
    'AI & Machine Learning',
    'Software & Computing',
    'Science & Math',
    'Philosophy, Religion & Meaning',
    'Psychology, Self & Relationships',
    'Politics, History & Society',
    'Economics, Business & Startups',
    'Arts, Music & Film',
    'Comedy & Internet Culture',
    'Health, Body & Movement',
    'Engineering, Design & Making',
    'Nature, Space & the World',
]
TYPES = ['talk', 'lecture', 'explainer', 'tutorial', 'documentary', 'interview',
         'podcast', 'demo', 'commentary', 'comedy', 'music', 'film', 'other']

PROMPT = """You are cataloguing YouTube videos that people in the Community Archive (an archive of tweets from a network of mostly tech-adjacent, philosophically curious Twitter users, often called "TPOT") shared in their tweets.

For each video below you get its title, channel, and some of the tweets that shared it. Return ONLY a JSON array, one object per video, in the same order, with exactly these keys:
- "id": the video id, copied
- "type": one of {types}
- "cat": one of {cats}
- "sub": a short subcategory within cat (2-5 words, Title-free plain phrase, e.g. "meditation & contemplative practice", "LLM research talks")
- "tags": 2-5 lowercase single-word or hyphenated tags
- "summary": 1-2 plain sentences on what the video is. Don't start with "This video".
- "why": 1 sentence on why these accounts share it, grounded in the tweets (what they say about it). Don't name the tweeters.
- "evergreen": true if it will still be worth watching in 10 years, false if tied to news of the moment
- "stance": array with one value per given tweet, in order: "strong" (enthusiastic recommendation), "rec" (recommends), "ref" (mentions/references neutrally), "neg" (critical)

Videos:
{videos}"""


def main():
    src, videos_path = sys.argv[1], sys.argv[2]
    limit = int(sys.argv[sys.argv.index('--limit') + 1]) if '--limit' in sys.argv else None
    videos = json.load(open(videos_path))['videos']
    rows = json.load(open(f'{src}/rows.json'))
    texts = {}
    for f in glob.glob(f'{src}/texts*.json'):
        for t in json.load(open(f)):
            if not t['z']:
                texts[t['t']] = t['x']
    by_video = {}
    for r in sorted(rows, key=lambda r: -(r['f'] or 0)):
        if r['t'] in texts:
            by_video.setdefault(r['v'], []).append(texts[r['t']])
    os.makedirs(f'{src}/enrich', exist_ok=True)

    batches = [videos[i:i + BATCH] for i in range(0, len(videos), BATCH)][:limit]

    def run(k):
        out = f'{src}/enrich/{k:04d}.json'
        if os.path.exists(out):
            return k, 'cached'
        block = []
        for v in batches[k]:
            tw = [' '.join(x.split())[:300] for x in by_video.get(v['id'], [])[:5]]
            block.append(json.dumps({'id': v['id'], 'title': v['title'], 'channel': v['channel'], 'tweets': tw}, ensure_ascii=False))
        prompt = PROMPT.format(types=TYPES, cats=CATEGORIES, videos='\n'.join(block))
        for _ in range(3):
            p = subprocess.run(['claude', '-p', '--model', 'sonnet', '--output-format', 'json'],
                               input=prompt, capture_output=True, text=True, timeout=900)
            try:
                result = json.loads(p.stdout)['result']
                body = result[result.index('['):result.rindex(']') + 1]
                items = json.loads(body)
                assert len(items) == len(batches[k])
                json.dump(items, open(out, 'w'), ensure_ascii=False)
                return k, 'ok'
            except Exception as e:  # noqa: BLE001
                err = repr(e)[:200]
        return k, 'failed ' + err

    with concurrent.futures.ThreadPoolExecutor(PARALLEL) as ex:
        for k, status in ex.map(run, range(len(batches))):
            print(k, status, flush=True)


if __name__ == '__main__':
    main()
