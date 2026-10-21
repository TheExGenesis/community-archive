#!/usr/bin/env python3
"""Build an aggregate-only homepage snapshot from the spread explorer assets."""
import argparse
import gzip
import json
import math
import random
import re
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path, help='Directory containing meta.json and regions.json')
parser.add_argument('--version', required=True, help='Unique snapshot identifier, used as the API ETag')
args = parser.parse_args()
meta = json.loads((args.source / 'meta.json').read_text())
regions = json.loads((args.source / 'regions.json').read_text())
hexes = meta['hex']
palette = ['#6f9aa8', '#c9a66b', '#8d86b5', '#86a878', '#c98572', '#5f86b3', '#b58aa5', '#a9b46d', '#d1a08a', '#6aa596']

# Match the explorer's graph colouring: adjacent countries get different colours.
touch = [set() for _ in regions['regions']]
for a in range(len(hexes['x'])):
    for b in range(a + 1, len(hexes['x'])):
        ra, rb = regions['hex_region'][a], regions['hex_region'][b]
        distance = (hexes['x'][a] - hexes['x'][b]) ** 2 + (hexes['y'][a] - hexes['y'][b]) ** 2
        if ra != rb and distance < (1.8 * hexes['size']) ** 2:
            touch[ra].add(rb)
            touch[rb].add(ra)
pick = [-1] * len(touch)
used = [0] * len(palette)
for i in sorted(range(len(touch)), key=lambda i: -len(touch[i])):
    taken = {pick[j] for j in touch[i]}
    candidates = [c for c in range(len(palette)) if c not in taken]
    colour = min(candidates, key=lambda c: used[c]) if candidates else i % len(palette)
    pick[i] = colour
    used[colour] += 1

# Explicit allow-lists: never copy account IDs, handles, representatives or posts.
region_keys = ('id', 'name', 'short', 'note', 'accounts', 'hexes', 'x', 'y', 'terms')
snapshot = {
    'version': args.version,
    'week': meta['weeks'][-1],
    'radius': hexes['size'],
    'cells': [{
        'x': hexes['x'][i], 'y': hexes['y'][i],
        'accounts': hexes['accounts'][i], 'archived': hexes['ca'][i],
        'region': regions['hex_region'][i], 'terms': regions['hex_terms'][i],
        'activity': round(row[-1] / (sum(row) / len(row)), 3) if sum(row) else 0,
    } for i, row in enumerate(meta['tweets_week'])],
    'regions': [{**{k: region[k] for k in region_keys}, 'color': palette[pick[i]]}
                for i, region in enumerate(regions['regions'])],
    'caveats': meta['caveats'],
}
# Deterministic k-means per country; labels contain only aggregate cell terms.
rng = random.Random(7)
cells = snapshot['cells']
df = {}
for cell in cells:
    for term in set(cell['terms']):
        df[term] = df.get(term, 0) + 1
clusters = []
for region in snapshot['regions']:
    ids = [i for i, cell in enumerate(cells) if cell['region'] == region['id']]
    if not ids:
        continue
    centres = [(cells[i]['x'], cells[i]['y']) for i in rng.sample(ids, max(1, round(len(ids) / 20)))]
    for _ in range(15):
        groups = [[] for _ in centres]
        for i in ids:
            c = cells[i]
            j = min(range(len(centres)), key=lambda j: (centres[j][0]-c['x'])**2 + (centres[j][1]-c['y'])**2)
            groups[j].append(i)
        centres = [(sum(cells[i]['x'] for i in g)/len(g), sum(cells[i]['y'] for i in g)/len(g)) if g else centres[j] for j,g in enumerate(groups)]
    for j, group in enumerate(groups):
        if len(group) < 5:
            continue
        counts, scores = {}, {}
        for i in group:
            for rank, term in enumerate(cells[i]['terms']):
                counts[term] = counts.get(term, 0) + 1
                scores[term] = scores.get(term, 0) + math.log(len(cells)/df[term])/(rank+1)
        words = sorted((t for t in counts if counts[t] >= max(2, .12*len(group)) and not re.search(r'\b(fuck\w*|shit\w*|cunt\w*|nigg\w*|bitch\w*|fagg\w*)\b', t, re.I)), key=lambda t: -scores[t]*counts[t])[:2]
        if not words:
            continue
        x,y = centres[j]
        anchor = min(group, key=lambda i: (cells[i]['x']-x)**2+(cells[i]['y']-y)**2)
        clusters.append({'x':cells[anchor]['x'], 'y':cells[anchor]['y'], 'label':' · '.join(words), 'region':region['id'], 'size':len(group)})
snapshot['clusters'] = clusters

target = Path(__file__).resolve().parents[1] / 'src/lib/hexMap/snapshot.json'
target.write_text(json.dumps(snapshot, separators=(',', ':')) + '\n')
print(f'{len(snapshot["cells"]):,} cells; {len(gzip.compress(target.read_bytes())):,} bytes gzipped')

(target.parent / "version.ts").write_text("export const MAP_VERSION = " + json.dumps(args.version) + "\nexport function mapUrl(path:string) { return `/api/hex-map/${path}${path.includes(\"?\")?\"&\":\"?\"}version=${MAP_VERSION}` }\n")
