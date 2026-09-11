"""Export the worker's actual prefilter code for the read-only admin panel."""
import argparse
import ast
import hashlib
import json
from pathlib import Path

import upstream_filter

ROOT = Path(__file__).resolve().parents[2]
TARGET = ROOT / 'src/lib/bulletin/candidate-filters.json'


def snapshot():
    functions = {}
    for filename, names in [('worker.py', ['candidates']),
                            ('upstream_filter.py', ['clean_text', 'side_of'])]:
        source = Path(__file__).with_name(filename).read_text()
        for node in ast.parse(source).body:
            if isinstance(node, ast.FunctionDef) and node.name in names:
                functions[node.name] = ast.get_source_segment(source, node)
    patterns = {name: getattr(upstream_filter, name).pattern
                for name in ['OFFER', 'ASK', 'CONVENTION', 'REQUEST', 'STRONG']}
    content = dict(patterns=patterns, functions=functions)
    content['sha256'] = hashlib.sha256(json.dumps(content, sort_keys=True).encode()).hexdigest()
    return content


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    value = snapshot()
    if args.check:
        if json.loads(TARGET.read_text()) != value:
            raise SystemExit('Candidate filter snapshot is stale; run services/bulletin/export_filters.py')
    else:
        TARGET.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')
