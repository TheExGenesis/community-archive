"""Extract top 50 original posts per year from a verified consent-safe public export.

Requires duckdb. Download tweets.parquet and manifest.json via the current
community-archive-public-export/latest.json pointer, then run:
  python scripts/profile-section-pool.py --parquet /path/tweets.parquet \
    --manifest /path/manifest.json --output /private/path/section-pool.json
Only currently subsectioned accounts are selected; the generator independently
checks current public-directory eligibility before sending posts to the model.
"""
import argparse
import datetime
import hashlib
import json
import re
from pathlib import Path

import duckdb

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--parquet', required=True)
parser.add_argument('--manifest', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args()
manifest = json.loads(Path(args.manifest).read_text())
checksum = hashlib.sha256()
with open(args.parquet, 'rb') as source:
    for block in iter(lambda: source.read(1024 * 1024), b''):
        checksum.update(block)
if checksum.hexdigest() != manifest['files']['tweets']['sha256']:
    raise ValueError('Export checksum does not match manifest')
existing = json.loads(Path('src/lib/metaTwitter/generatedSections.json').read_text())
ids = {account_id for account_id, account in existing['accounts'].items()
       if any(year['sections'] for year in account['years'].values())}
ids.update(re.findall(r"^  '(\d+)': \{", Path('src/lib/metaTwitter/curatedSections.ts').read_text(), re.M))
connection = duckdb.connect()
connection.execute("SET TimeZone='UTC'")
connection.execute('SET threads=4')
connection.execute('SET memory_limit=\'1GB\'')
connection.execute('CREATE TABLE selected_accounts (account_id VARCHAR)')
connection.executemany('INSERT INTO selected_accounts VALUES (?)', [(key,) for key in ids])
connection.read_parquet(args.parquet).create_view('export_tweets')
rows = connection.execute('''
  SELECT DISTINCT CAST(t.account_id AS VARCHAR), year(CAST(created_at AS TIMESTAMP)) AS year
  FROM export_tweets t JOIN selected_accounts a ON CAST(t.account_id AS VARCHAR) = a.account_id
  WHERE year(CAST(created_at AS TIMESTAMP)) BETWEEN 2006 AND ?
''', [datetime.datetime.now(datetime.timezone.utc).year]).fetchall()
accounts = {}
for account_id, year in rows:
    accounts.setdefault(account_id, {})[str(year)] = []
rows = connection.execute('''
  SELECT CAST(t.account_id AS VARCHAR), year(CAST(created_at AS TIMESTAMP)) AS year,
         CAST(tweet_id AS VARCHAR), strftime(created_at, '%Y-%m-%dT%H:%M:%S.%gZ'), full_text, favorite_count
  FROM export_tweets t JOIN selected_accounts a ON CAST(t.account_id AS VARCHAR) = a.account_id
  WHERE coalesce(CAST(reply_to_tweet_id AS VARCHAR), '') IN ('', '0')
    AND coalesce(CAST(retweeted_tweet_id AS VARCHAR), '') IN ('', '0')
    AND NOT regexp_matches(full_text, '^\\s*(RT\\s+@|@)', 'i')
    AND length(trim(regexp_replace(full_text, 'https?://[^ ]+', '', 'g'))) > 0
    AND NOT regexp_full_match(trim(regexp_replace(full_text, 'https?://[^ ]+', '', 'g')), '(photo|video|audio|image)\s*:?\s*', 'i')
    AND year(CAST(created_at AS TIMESTAMP)) BETWEEN 2006 AND ?
  QUALIFY row_number() OVER (PARTITION BY t.account_id, year(CAST(created_at AS TIMESTAMP))
      ORDER BY favorite_count DESC, CAST(tweet_id AS VARCHAR) ASC) <= 50
  ORDER BY t.account_id, year, favorite_count DESC, CAST(tweet_id AS VARCHAR)
''', [datetime.datetime.now(datetime.timezone.utc).year]).fetchall()
for account_id, year, tweet_id, created_at, full_text, likes in rows:
    accounts[account_id][str(year)].append(dict(tweet_id=tweet_id, created_at=created_at, full_text=full_text, favorite_count=int(likes), quote_count=0))
Path(args.output).write_text(json.dumps(dict(source=manifest['publication']['urls']['manifest'], accounts=accounts), ensure_ascii=False)+'\n')
print(f'{len(accounts)} accounts, {sum(map(len, accounts.values()))} active years, {len(rows)} candidates')
