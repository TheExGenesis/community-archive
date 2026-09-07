import io
import json
import unittest
import tempfile
from pathlib import Path
import pandas as pd
from export_display_data import normalize_birdseye, normalize_strands

class DisplayExportTest(unittest.TestCase):
    def test_resolves_evidence_and_ignores_missing_optional_username(self):
        parquet = io.BytesIO()
        pd.DataFrame([{'cluster_id': '2', 'name': 'Learning', 'summary': '[Practice](E1)', 'low_quality_cluster': '1'}]).to_parquet(parquet)
        files = {
            'labeled_cluster_hierarchy.parquet': parquet.getvalue(),
            'cluster_ontology_items.json': json.dumps({'2': {'ontology_items': {
                'yearly_summaries': [{'period': '2021', 'summary': 'Started [learning](E1).'}],
                'entities': [{'id': 'E1', 'name': 'Practice', 'username': None, 'tweet_references': ['1', 'missing']}],
                'social_relationships': [{'username': 'Other_Person', 'interaction_type': 'Conversation', 'tweet_references': ['1']}],
            }}}).encode(),
            'local_tweet_id_maps.json': json.dumps({'2': {'1': '1423006703495176194'}}).encode(),
            'group_results.json': json.dumps({'groups': [{'name': 'Ideas', 'members': [{'id': '2'}]}]}).encode(),
        }
        result = normalize_birdseye('member', files)
        cluster = result['clusters'][0]
        self.assertEqual(result['hiddenClusterIds'], ['2'])
        self.assertEqual(cluster['summary'], 'Practice')
        self.assertEqual(cluster['sections'][0]['items'][0]['description'], 'Started learning.')
        self.assertEqual(cluster['participants'], ['member', 'other_person'])
        self.assertEqual(cluster['sections'][1]['items'][0]['tweetIds'], ['1423006703495176194'])
        self.assertEqual(cluster['years'], [{'year': 2021, 'count': 1}])
        self.assertNotIn('message', json.dumps(result))

class StrandExportTest(unittest.TestCase):
    def test_reads_keyed_tweet_index_and_preserves_large_reference_ids(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'strands_data.json'
            source.write_text(json.dumps({'generatedAt': '2026-01-13', 'strands': [{
                'seed_tweet_id': '1423006703495176194', 'seedTweet': {'username': 'Member'},
                'seeds': [{'tweet_id': 1423006703495176195}], 'rating': {'essential_tweets': []},
            }]}))
            (root / 'bangers_tweets.json').write_text(json.dumps({'tweets': {'1423006703495176195': {
                'tweet_id': '1423006703495176195', 'username': 'Other_Person',
            }}}))
            generated, strands = normalize_strands(source)
            self.assertEqual(generated, '2026-01-13')
            self.assertEqual(strands[0]['id'], '1423006703495176194')
            self.assertEqual(strands[0]['participants'], ['member', 'other_person'])

if __name__ == '__main__':
    unittest.main()
