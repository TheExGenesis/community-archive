#!/usr/bin/env python3
"""Second LLM pass for CA Tube, after enrich.py: tidy subcategories and curate playlists.

Usage: python3 -I curate.py <scratch dir>
Reads enrich/*.json and the built public/tube/videos.json + c/ shards (pass the
repo's public/tube as the second arg); writes <scratch>/submap.json and
<scratch>/playlists.json, which build-tube-data.py folds in.
"""
import collections
import concurrent.futures
import glob
import json
import os
import subprocess
import sys

SUBMAP_PROMPT = """These are free-text subcategories an LLM assigned to YouTube videos in the category "{cat}", with how many videos got each.
Merge them into at most 10 canonical subcategories (plain lowercase phrases, 2-5 words, distinct, covering everything; a catch-all like "{cat_lower} (other)" is fine for stragglers).
Return ONLY a JSON object mapping every input subcategory exactly as given to its canonical subcategory.

{subs}"""

PLAYLIST_PROMPT = """You curate playlists for CA Tube: YouTube videos that people in the Community Archive (a public archive of tweets from a network of mostly tech-adjacent, philosophically curious Twitter users, often called "TPOT") kept sharing.

Below are the most shared videos in the category "{cat}" (id, title, channel, number of distinct accounts that shared it, summary).
Make {k} playlists from them, each a deliberate sequence of 8-12 videos that reads well in order (an arc, a learning path, or a theme), with no video in two playlists. Favour videos with more sharers but include a few lesser-known ones where they fit.
Return ONLY a JSON array of objects with keys: "title" (short, evocative, no category name), "blurb" (1-2 sentences in a plain, warm voice; no hype), "ids" (ordered video ids, copied exactly).

{videos}"""


def claude(prompt):
    for _ in range(3):
        p = subprocess.run(['claude', '-p', '--model', 'sonnet', '--output-format', 'json'],
                           input=prompt, capture_output=True, text=True, timeout=900)
        try:
            result = json.loads(p.stdout)['result']
            start = min(i for i in (result.find('['), result.find('{')) if i >= 0)
            return json.JSONDecoder().raw_decode(result[start:])[0]
        except Exception:  # noqa: BLE001
            continue
    raise RuntimeError('claude call failed')


def main():
    src, public = sys.argv[1], sys.argv[2]
    enriched = {}
    for f in sorted(glob.glob(f'{src}/enrich/*.json')):
        for e in json.load(open(f)):
            enriched[e['id']] = e
    videos = json.load(open(f'{public}/videos.json'))['videos']
    summaries = {}
    for f in glob.glob(f'{public}/c/*.json'):
        for vid, d in json.load(open(f)).items():
            summaries[vid] = d.get('summary') or ''

    by_cat = collections.defaultdict(collections.Counter)
    for e in enriched.values():
        if e.get('cat') and e.get('sub'):
            by_cat[e['cat']][e['sub']] += 1

    def submap(cat):
        subs = '\n'.join(f'{n}\t{s}' for s, n in by_cat[cat].most_common())
        m = claude(SUBMAP_PROMPT.format(cat=cat, cat_lower=cat.lower(), subs=subs))
        return cat, {s: m.get(s, s) for s in by_cat[cat]}

    def playlists(cat):
        top = [v for v in videos if v.get('cat') == cat][:150]
        k = 3 if len(top) >= 100 else 2 if len(top) >= 40 else 1
        lines = '\n'.join(json.dumps({'id': v['id'], 'title': v['title'], 'channel': v['channel'],
                                      'sharers': v['n'], 'summary': summaries.get(v['id'], '')},
                                     ensure_ascii=False) for v in top)
        return cat, claude(PLAYLIST_PROMPT.format(cat=cat, k=k, videos=lines))

    cats = sorted(by_cat)
    out = {}
    lists = []
    with concurrent.futures.ThreadPoolExecutor(6) as ex:
        for cat, m in ex.map(submap, cats):
            out[cat] = m
            print('submap', cat, len(set(m.values())), flush=True)
        for cat, pls in ex.map(playlists, cats):
            for i, p in enumerate(pls):
                slug = ''.join(ch if ch.isalnum() else '-' for ch in p['title'].lower()).strip('-')
                lists.append({'id': slug[:48] or f'{cat}-{i}', 'title': p['title'], 'blurb': p['blurb'],
                              'section': cat, 'ids': p['ids']})
            print('playlists', cat, len(pls), flush=True)
    json.dump(out, open(f'{src}/submap.json', 'w'), ensure_ascii=False, indent=1)
    json.dump(lists, open(f'{src}/playlists.json', 'w'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
