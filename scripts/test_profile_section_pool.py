import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import duckdb


class SectionPoolTest(unittest.TestCase):
    def test_utc_years_rank_cap_and_exclusions(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            parquet = root / 'tweets.parquet'
            connection = duckdb.connect()
            connection.execute('''CREATE TABLE tweets (
                account_id VARCHAR, tweet_id VARCHAR, created_at TIMESTAMPTZ,
                full_text VARCHAR, favorite_count BIGINT,
                reply_to_tweet_id VARCHAR, retweeted_tweet_id VARCHAR)''')
            rows = [('269148958', str(i), '2025-06-01T00:00:00Z', f'original thought {i}', i, None, None) for i in range(60)]
            rows += [
                ('269148958', 'boundary', '2024-12-31T23:30:00-02:00', 'new year thought', 500, None, None),
                ('269148958', 'reply', '2025-01-01T00:00:00Z', 'reply', 999, '1', None),
                ('269148958', 'retweet', '2025-01-01T00:00:00Z', 'retweet', 999, None, '1'),
                ('269148958', 'link', '2025-01-01T00:00:00Z', 'https://t.co/link', 999, None, None),
                ('269148958', 'thin', '2023-01-01T00:00:00Z', 'a reply', 1, '1', None),
                ('269148958', 'photo', '2025-01-01T00:00:00Z', 'Photo: https://t.co/photo', 999, None, None),
                ('42', 'other', '2025-01-01T00:00:00Z', 'not selected', 999, None, None),
            ]
            connection.executemany('INSERT INTO tweets VALUES (?, ?, ?, ?, ?, ?, ?)', rows)
            connection.sql('SELECT * FROM tweets').write_parquet(str(parquet))
            manifest = root / 'manifest.json'
            manifest.write_text(json.dumps({'files': {'tweets': {'sha256': hashlib.sha256(parquet.read_bytes()).hexdigest()}}, 'publication': {'urls': {'manifest': 'test-export'}}}))
            output = root / 'pool.json'
            command = [sys.executable, 'scripts/profile-section-pool.py', '--parquet', str(parquet), '--manifest', str(manifest), '--output', str(output)]
            subprocess.run(command, check=True, capture_output=True)
            result = json.loads(output.read_text())['accounts']
            self.assertEqual(list(result), ['269148958'])
            self.assertEqual(result['269148958']['2023'], [])
            tweets = result['269148958']['2025']
            self.assertEqual(len(tweets), 50)
            self.assertEqual(tweets[0]['tweet_id'], 'boundary')
            self.assertEqual(tweets[0]['created_at'], '2025-01-01T01:30:00.000Z')
            self.assertEqual(tweets[-1]['tweet_id'], '11')
            manifest.write_text(json.dumps({'files': {'tweets': {'sha256': 'wrong'}}}))
            self.assertNotEqual(subprocess.run(command, capture_output=True).returncode, 0)


if __name__ == '__main__':
    unittest.main()
