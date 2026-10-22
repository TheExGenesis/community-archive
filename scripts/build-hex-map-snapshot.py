#!/usr/bin/env python3
"""Build an aggregate-only homepage snapshot from the spread explorer assets."""
import argparse
import gzip
import json
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
target = Path(__file__).resolve().parents[1] / 'src/lib/hexMap/snapshot.json'
target.write_text(json.dumps(snapshot, separators=(',', ':')) + '\n')
print(f'{len(snapshot["cells"]):,} cells; {len(gzip.compress(target.read_bytes())):,} bytes gzipped')
