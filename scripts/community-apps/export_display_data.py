"""Export existing Birdseye/Strands display data; never run inference or unpickle archives.
Requires pandas, pyarrow; --modal also requires an authenticated Modal SDK.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import io
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

FILES = ('labeled_cluster_hierarchy.parquet', 'cluster_ontology_items.json',
         'local_tweet_id_maps.json', 'group_results.json')
USERNAME = re.compile(r'^[a-zA-Z0-9_]{1,15}$')


def clean_links(text):
    # The original app uses local ontology IDs as markdown links. Their labels
    # stay readable; the evidence section below supplies real tweet permalinks.
    return re.sub(r'\[([^\]]+)\]\((?!https?://)[^)]*\)', r'\1', str(text or ''))


def normalize_birdseye(username, files):
    hierarchy = pd.read_parquet(io.BytesIO(files[FILES[0]])).fillna('')
    ontology = json.loads(files[FILES[1]])
    maps = json.loads(files[FILES[2]])
    groups = json.loads(files[FILES[3]])
    clusters = []
    for row in hierarchy.to_dict('records'):
        cid = str(row['cluster_id'])
        record = ontology.get(cid, {})
        if not record or record.get('is_error'):
            continue
        refs = {str(k): str(v) for k, v in maps.get(cid, {}).items() if str(v).isdigit()}
        ids = list(dict.fromkeys(refs.values()))
        sections = []
        participants = {username}
        for category, items in record.get('ontology_items', {}).items():
            if not isinstance(items, list):
                continue
            normalized = []
            for item in items:
                if not isinstance(item, dict):
                    continue
                label = next((str(v) for k, v in item.items() if k not in ('id', 'description', 'tweet_references') and isinstance(v, str)), '')
                if not label:
                    continue
                if isinstance(item.get('username'), str) and USERNAME.fullmatch(item['username']):
                    participants.add(item['username'].lower())
                normalized.append({'label': clean_links(label), 'description': clean_links(item.get('description') or item.get('summary') or item.get('interaction_type', '')),
                                   'tweetIds': [refs[str(r)] for r in item.get('tweet_references', []) if str(r) in refs]})
            if normalized:
                sections.append({'name': category.replace('_', ' ').capitalize(), 'items': normalized})
        years = Counter()
        for tid in ids:
            if int(tid) >= 4194304000000:
                year = datetime.fromtimestamp(((int(tid) >> 22) + 1288834974657) / 1000, timezone.utc).year
                if 2010 <= year <= datetime.now(timezone.utc).year:
                    years[year] += 1
        summary = clean_links(row.get('summary') or record.get('cluster_summary', ''))
        participants.update(name.lower() for name in re.findall(r'@([A-Za-z0-9_]{1,15})', summary))
        clusters.append({'id': cid, 'name': str(row.get('name') or f'Topic {cid}'), 'summary': summary,
                         'participants': sorted(participants), 'tweetIds': ids,
                         'years': [{'year': y, 'count': n} for y, n in sorted(years.items())], 'sections': sections})
    return {'displayVersion': 2, 'hiddenClusterIds': [str(row['cluster_id']) for row in hierarchy.to_dict('records') if str(row.get('low_quality_cluster', '0')) == '1'], 'username': username, 'groups': [{'name': g['name'], 'clusterIds': [str(m['id']) for m in g.get('members', [])]} for g in groups.get('groups', [])], 'clusters': clusters}


def normalize_strands(source):
    data = json.loads(source.read_text())
    # Use the existing tweet index to identify supporting authors without copying
    # its tweet corpus into the web app's display package.
    lookup = {}
    tweet_path = source.with_name('bangers_tweets.json')
    if tweet_path.exists():
        tweets = json.loads(tweet_path.read_text())
        if isinstance(tweets, dict):
            tweets = tweets.get('tweets', [])
        if isinstance(tweets, dict):
            tweets = tweets.values()
        for tweet in tweets:
            if isinstance(tweet, dict):
                lookup[str(tweet.get('tweet_id', ''))] = tweet.get('username', '')
    result = []
    for strand in data['strands']:
        tweet = strand.get('seedTweet') or {}
        username = tweet.get('username', '')
        if not USERNAME.fullmatch(username):
            continue
        essential = strand.get('rating', {}).get('essential_tweets', [])
        refs = [str(r['tweet_id']) for r in strand.get('seeds', []) + essential]
        participants = {username.lower()}
        participants.update(lookup[r].lower() for r in refs if lookup.get(r))
        participants.update(n.lower() for n in re.findall(r'@([A-Za-z0-9_]{1,15})', strand.get('summary', '')))
        result.append({'id': str(strand['seed_tweet_id']), 'title': strand.get('title') or 'Untitled strand',
                       'summary': strand.get('summary', ''), 'rating': strand.get('rating', {}).get('rating', 0),
                       'username': username, 'text': tweet.get('full_text', ''), 'createdAt': tweet.get('created_at', ''),
                       'participants': sorted(participants),
                       'essentialTweets': [{'id': str(r['tweet_id']), 'annotation': r.get('annotation', '')} for r in essential]})
    return data.get('generatedAt', ''), result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--modal', action='store_true')
    parser.add_argument('--quality-index-only', action='store_true', help='Refresh only the small original hidden-topic index in an existing package')
    parser.add_argument('--resume', action='store_true', help='Resume an interrupted local export before its manifest is published')
    parser.add_argument('--local-root', type=Path)
    parser.add_argument('--strands', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.quality_index_only:
        if not args.modal:
            parser.error('--quality-index-only requires --modal')
        import modal
        volume = modal.Volume.from_name('twitter-archive-data')
        manifest_path = args.output / 'manifest.json'
        manifest = json.loads(manifest_path.read_text())
        def quality(entry):
            raw = b''.join(volume.read_file(entry['username'] + '/labeled_cluster_hierarchy.parquet'))
            rows = pd.read_parquet(io.BytesIO(raw)).fillna('').to_dict('records')
            return {**entry, 'hiddenClusterIds': [str(row['cluster_id']) for row in rows if str(row.get('low_quality_cluster', '0')) == '1']}
        with ThreadPoolExecutor(max_workers=4) as executor:
            manifest['birdseye'] = list(executor.map(quality, manifest['birdseye']))
        manifest_path.write_text(json.dumps(manifest, indent=2))
        print(json.dumps({'accounts': len(manifest['birdseye']), 'hiddenTopics': sum(len(entry['hiddenClusterIds']) for entry in manifest['birdseye'])}))
        return
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    existing = sorted((args.output / 'v1').glob('*')) if args.resume else []
    prefix = 'v1/' + (existing[-1].name if existing else stamp)
    target = args.output / prefix
    (target / 'birdseye').mkdir(parents=True, exist_ok=True)
    if args.modal:
        import modal
        volume = modal.Volume.from_name('twitter-archive-data')
        names = sorted(e.path for e in volume.listdir('/') if e.type == 2 and USERNAME.fullmatch(e.path))
        def read(name):
            available = {Path(e.path).name: e for e in volume.listdir('/' + name)}
            if any(f not in available for f in FILES):
                return None
            if sum(available[f].size for f in FILES) > 10_000_000:
                raise ValueError(f'{name}: display input exceeds 10 MB limit')
            return {f: b''.join(volume.read_file(f'{name}/{f}')) for f in FILES}
    elif args.local_root:
        names = sorted(p.name for p in args.local_root.iterdir() if p.is_dir() and USERNAME.fullmatch(p.name))
        def read(name):
            p = args.local_root / name
            return {f: (p / f).read_bytes() for f in FILES} if all((p / f).exists() for f in FILES) else None
    else:
        parser.error('Choose --modal or --local-root')
    def export_account(name):
        saved = target / 'birdseye' / f'{name.lower()}.json'
        if args.resume and saved.exists() and 'hiddenClusterIds' in json.loads(saved.read_text()):
            saved_data = json.loads(saved.read_text())
            return {'username': name.lower(), 'hiddenClusterIds': saved_data.get('hiddenClusterIds', [])}
        files = read(name)
        if files is None:
            return None
        normalized = normalize_birdseye(name.lower(), files)
        if not normalized['clusters']:
            return None
        temporary = saved.with_suffix('.tmp')
        temporary.write_text(json.dumps(normalized, ensure_ascii=False))
        temporary.replace(saved)
        return {'username': name.lower(), 'hiddenClusterIds': normalized['hiddenClusterIds']}
    accounts, skipped = [], []
    with ThreadPoolExecutor(max_workers=4) as executor:
        for name, result in zip(names, executor.map(export_account, names)):
            if result:
                accounts.append(result)
            else:
                skipped.append(name)
            if (len(accounts) + len(skipped)) % 20 == 0:
                print(f'Prepared {len(accounts)} analyses; checked {len(accounts) + len(skipped)}/{len(names)} saved directories', flush=True)
    generated, strands = normalize_strands(args.strands)
    (target / 'strands.json').write_text(json.dumps(strands, ensure_ascii=False))
    manifest = {'version': 1, 'prefix': prefix, 'importedAt': datetime.now(timezone.utc).isoformat(), 'strandsGeneratedAt': generated, 'birdseye': accounts}
    (args.output / 'manifest.json').write_text(json.dumps(manifest, indent=2))
    print(json.dumps({'accounts': len(accounts), 'strands': len(strands), 'incompleteAccounts': skipped, 'bytes': sum(p.stat().st_size for p in target.rglob('*.json'))}))


if __name__ == '__main__':
    main()
