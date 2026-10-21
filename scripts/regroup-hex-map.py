#!/usr/bin/env python3
"""Apply a finer region cut to unchanged map cells, preserving parent colours."""
import argparse
import colorsys
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
keys = ('id', 'name', 'short', 'note', 'accounts', 'hexes', 'x', 'y', 'terms')
regions = []
for region in cut['regions']:
    ids = [i for i, r in enumerate(cut['hex_region']) if r == region['id']]
    parent = region['parent_region_24']
    assert all(cells[i]['region'] == parent for i in ids), 'Region crosses old parent'
    assert len(ids) == region['hexes'], 'Region cell count mismatch'
    assert sum(cells[i]['accounts'] for i in ids) == region['accounts'], 'Account count mismatch'
    anchor = min(ids, key=lambda i: (cells[i]['x'] - region['x']) ** 2 + (cells[i]['y'] - region['y']) ** 2)
    siblings = sorted((r for r in cut['regions'] if r['parent_region_24'] == parent), key=lambda r: (-r['hexes'], r['id']))
    rank = next(i for i, r in enumerate(siblings) if r['id'] == region['id'])
    colour = parents[parent]['color']
    # Largest piece retains its exact old colour; siblings vary only lightness.
    if rank:
        rgb = [int(colour[i:i+2], 16) / 255 for i in (1, 3, 5)]
        hue, light, saturation = colorsys.rgb_to_hls(*rgb)
        delta = .065 * ((rank + 1) // 2) * (1 if rank % 2 else -1)
        rgb = colorsys.hls_to_rgb(hue, max(.2, min(.8, light + delta)), saturation)
        colour = '#' + ''.join(f'{round(c * 255):02x}' for c in rgb)
    regions.append({**{k: region[k] for k in keys}, 'x': cells[anchor]['x'], 'y': cells[anchor]['y'], 'color': colour})
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
