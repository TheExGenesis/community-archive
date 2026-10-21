#!/usr/bin/env python3
"""Apply a finer region cut to unchanged map cells, retaining the existing muted palette."""
import argparse
from collections import Counter
import gzip
import json
from pathlib import Path
from hex_map_clusters import build_clusters

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('base', type=Path, help='Previous aggregate snapshot')
parser.add_argument('regions', type=Path, help='Region cut with parent_region_24 provenance')
parser.add_argument('--revision', required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
base = json.loads(args.base.read_text())
cut = json.loads(args.regions.read_text())
cells = base['cells']
assert len(cut['hex_region']) == len(cells), 'Cell count changed'
assert cut['hex_terms'] == [c['terms'] for c in cells], 'Cell order/terms changed'
assert [r['id'] for r in cut['regions']] == list(range(len(cut['regions']))), 'Invalid region IDs'
assert set(cut['hex_region']) == set(range(len(cut['regions']))), 'Invalid cell region'
parents = {r['id']: r for r in base['regions']}
# Keep the largest piece of each old community in its original colour. Give
# its siblings distinct palette colours, favouring contrast across shared edges.
palette = list(dict.fromkeys(r['color'] for r in base['regions']))
children = {}
for region in cut['regions']:
    children.setdefault(region['parent_region_24'], []).append(region)
colours = {}
for parent, group in children.items():
    largest = max(group, key=lambda r: (r['hexes'], -r['id']))
    colours[largest['id']] = parents[parent]['color']
touch = [set() for _ in cut['regions']]
for a, cell in enumerate(cells):
    for b in range(a + 1, len(cells)):
        ra, rb = cut['hex_region'][a], cut['hex_region'][b]
        if ra != rb and (cell['x'] - cells[b]['x']) ** 2 + (cell['y'] - cells[b]['y']) ** 2 < (1.8 * base['radius']) ** 2:
            touch[ra].add(rb)
            touch[rb].add(ra)
def distance(a, b):
    return sum((int(a[i:i+2], 16) - int(b[i:i+2], 16)) ** 2 for i in (1, 3, 5))
for region in sorted(cut['regions'], key=lambda r: (-len(touch[r['id']]), r['id'])):
    rid = region['id']
    if rid in colours:
        continue
    siblings = {r['id'] for r in children[region['parent_region_24']]}
    taken = {colours[i] for i in siblings if i in colours}
    neighbours = {colours[i] for i in touch[rid] | siblings if i in colours}
    usage = Counter(colours.values())
    colours[rid] = max((c for c in palette if c not in taken), key=lambda c: (
        min(distance(c, other) for other in neighbours), -usage[c],
    ))
keys = ('id', 'name', 'short', 'note', 'accounts', 'hexes', 'x', 'y', 'terms')
regions = []
for region in cut['regions']:
    ids = [i for i, r in enumerate(cut['hex_region']) if r == region['id']]
    parent = region['parent_region_24']
    assert all(cells[i]['region'] == parent for i in ids), 'Region crosses old parent'
    assert len(ids) == region['hexes'], 'Region cell count mismatch'
    assert sum(cells[i]['accounts'] for i in ids) == region['accounts'], 'Account count mismatch'
    anchor = min(ids, key=lambda i: (cells[i]['x'] - region['x']) ** 2 + (cells[i]['y'] - region['y']) ** 2)
    colour = colours[region['id']]
    regions.append({**{k: region[k] for k in keys}, 'x': cells[anchor]['x'], 'y': cells[anchor]['y'], 'color': colour})
# Editorial display names are independent of the source cut's terminology.
for region in regions:
    if region['short'] == '#keep4o':
        region['name'] = region['short'] = 'AI companions'
snapshot = {
    **base,
    'revision': args.revision,
    'cells': [{**cell, 'region': cut['hex_region'][i]} for i, cell in enumerate(cells)],
    'regions': regions,
}
snapshot['clusters'] = build_clusters(snapshot)
args.output.write_text(json.dumps(snapshot, separators=(',', ':')) + '\n')
print(f'{len(cells)} unchanged cells; {len(regions)} regions; {len(gzip.compress(args.output.read_bytes()))} bytes gzipped')

(args.output.parent / 'version.ts').write_text(
    'export const MAP_VERSION = ' + json.dumps(snapshot['version']) + '\n'
    + '// Region labels/boundaries can change without moving any account between cells.\n'
    + 'export const MAP_REVISION = ' + json.dumps(args.revision) + '\n'
    + 'export function mapUrl(path:string) { return `/api/hex-map/${path}${path.includes("?")?"&":"?"}version=${MAP_VERSION}&revision=${MAP_REVISION}` }\n'
)
