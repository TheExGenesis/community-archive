#!/usr/bin/env python3
"""Export the TPOT spread explorer's real-usage data as static files for the admin page.

The admin spread explorer (src/app/admin/spread-explorer) reads precomputed files
instead of a live ClickHouse: one `meta.json` with the map, and word counts
sharded by CRC32(token) % shards so any typed word costs one small fetch.

    python3 scripts/build-spread-explorer-data.py \
      --explorer-data /path/to/spread-explorer/data \
      --tpot-meta /path/to/spread-explorer/network/data-tpot-map/meta.json \
      --regions /path/to/regions.json --out /path/to/export --version 2026-10-24

Sources (all local, the STLM workspace):
- `<explorer-data>/meta.json`: hex positions, accounts per hex, central accounts.
- `<tpot-meta>`: months and tweets per hex per month (denominators).
- `<regions>`: the 38 TPOT regions with labels and colours.
- ClickHouse `xyra.tpothex_word` (token, cell, ym, n), `xyra.tpothex_word_recent`
  for the vocabulary, `xyra.spread_handle` + `xyra.spread_hex` for anchors.

Output: `meta.json`, `vocab.json`, `handles.json.gz`, `words/<shard>.json.gz`.
The export names real accounts (central accounts per hex, handles for anchors),
so it is served only behind the admin gate: never commit it or put it in `public/`.
"""

from __future__ import annotations

import argparse
import gzip
import json
import urllib.parse
import urllib.request
import zlib
from pathlib import Path

REPS_PER_HEX = 8
VOCAB_SIZE = 30000


def query(url: str, sql: str, fmt: str = "JSONCompact"):
    raw = urllib.request.urlopen(urllib.request.Request(url, data=(sql + " FORMAT " + fmt).encode()), timeout=3600)
    return raw


def rows(url: str, sql: str) -> list[list]:
    return json.loads(query(url, sql).read())["data"]


def shard_of(token: str, shards: int) -> int:
    return zlib.crc32(token.encode("utf-8")) % shards


def write_gz(path: Path, obj) -> int:
    data = json.dumps(obj, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    path.write_bytes(gzip.compress(data, 6))
    return len(data)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--explorer-data", required=True, type=Path)
    p.add_argument("--tpot-meta", required=True, type=Path)
    p.add_argument("--regions", required=True, type=Path)
    p.add_argument("--out", required=True, type=Path)
    p.add_argument("--version", required=True, help="an identifier for this export, shown on the page")
    p.add_argument("--clickhouse", default="http://127.0.0.1:18123")
    p.add_argument("--shards", type=int, default=4096)
    p.add_argument("--skip-words", action="store_true", help="only rebuild meta, vocab and handles")
    args = p.parse_args()

    explorer = json.loads((args.explorer_data / "meta.json").read_text())
    tpot = json.loads(args.tpot_meta.read_text())
    regions = json.loads(args.regions.read_text())
    hx = explorer["hex"]
    hexes = len(hx["x"])
    if len(tpot["hex"]["x"]) != hexes or tpot["hex"]["x"][:5] != hx["x"][:5]:
        raise SystemExit("the explorer map and the tpot-map meta have different hexes")
    if len(regions["hex_region"]) != hexes:
        raise SystemExit("regions.json is for a different map")
    months = [m for m in tpot["months"]]
    at = {int(m.replace("-", "")): i for i, m in enumerate(months)}

    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "words").mkdir(exist_ok=True)

    meta = {
        "version": args.version,
        "months": months,
        "hex": {
            "x": hx["x"], "y": hx["y"], "size": hx["size"], "accounts": hx["accounts"], "ca": hx["ca"],
            # central accounts: handle and whether they are in the Community Archive; no ids
            "reps": [[{"handle": r["handle"], "ca": bool(r.get("ca"))} for r in reps[:REPS_PER_HEX]] for reps in hx["reps"]],
        },
        "tweets": tpot["tweets"],
        "tweets_off_map": tpot["tweets_off_map"],
        "hex_region": regions["hex_region"],
        "hex_terms": regions.get("hex_terms", [[] for _ in range(hexes)]),
        "regions": [{k: r[k] for k in ("id", "name", "short", "note", "family", "accounts", "hexes", "x", "y", "reps", "terms", "colour", "colour_dark") if k in r}
                    for r in regions["regions"]],
        "accounts": explorer["accounts"],
        "shards": args.shards,
        "caveats": explorer["caveats"] + ["words: whole tokens, URLs and @mentions removed, one count per tweet; one word at a time"],
    }
    (args.out / "meta.json").write_text(json.dumps(meta, separators=(",", ":"), ensure_ascii=False))
    print(f"meta.json: {hexes} hexes, {len(months)} months, {len(meta['regions'])} regions")

    vocab = rows(args.clickhouse, f"""SELECT token, sum(n) s FROM xyra.tpothex_word_recent WHERE cell < {hexes}
        GROUP BY token ORDER BY s DESC LIMIT {VOCAB_SIZE}""")
    (args.out / "vocab.json").write_text(json.dumps([[t, int(s)] for t, s in vocab], separators=(",", ":"), ensure_ascii=False))
    print(f"vocab.json: {len(vocab)} tokens")

    handles = rows(args.clickhouse, """SELECT lower(h.handle), x.hex, x.x, x.y FROM xyra.spread_handle h
        INNER JOIN xyra.spread_hex x ON x.author_id = h.author_id""")
    write_gz(args.out / "handles.json.gz", {h: [int(c), round(float(x), 4), round(float(y), 4)] for h, c, x, y in handles})
    print(f"handles.json.gz: {len(handles)} handles")

    if args.skip_words:
        return
    # one pass over the word table, grouped per token and ordered by shard, so each shard file is written once
    ym_lo, ym_hi = min(at), max(at)
    sql = f"""SELECT CRC32(token) % {args.shards} s, token, groupArray((cell, ym, n))
        FROM xyra.tpothex_word WHERE ym >= {ym_lo} AND ym <= {ym_hi} GROUP BY s, token ORDER BY s, token"""
    stream = query(args.clickhouse, sql, "JSONCompactEachRow")
    current, shard, tokens, raw_bytes = -1, {}, 0, 0
    written = [0] * args.shards

    def flush() -> None:
        nonlocal raw_bytes
        if current >= 0:
            raw_bytes += write_gz(args.out / "words" / f"{current:04d}.json.gz", shard)
            written[current] = len(shard)

    for line in stream:
        s, token, triples = json.loads(line)
        s = int(s)
        if s != current:
            flush()
            current, shard = s, {}
        flat = []
        for cell, ym, n in triples:
            cell, i = int(cell), at[int(ym)]
            if cell >= hexes:
                cell = hexes                                   # off-map accounts: counted in the total only
            flat.extend((cell, i, int(n)))
        shard[token] = flat
        tokens += 1
    flush()
    for s in range(args.shards):                              # every shard exists, so a miss is "unknown word", not "missing file"
        if not written[s]:
            write_gz(args.out / "words" / f"{s:04d}.json.gz", {})
    size = sum(f.stat().st_size for f in (args.out / "words").glob("*.json.gz"))
    print(f"words: {tokens} tokens in {args.shards} shards, {size / 1e6:.0f} MB gzipped ({raw_bytes / 1e6:.0f} MB raw), largest shard {max(written)} tokens")


if __name__ == "__main__":
    main()
