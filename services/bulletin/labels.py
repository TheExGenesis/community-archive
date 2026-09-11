"""Bulletin classification prompt and strict output validation."""
import datetime as dt
import html
import re

KINDS = ['help', 'feedback', 'intro', 'free', 'invite', 'opportunity']

# Frozen bootstrap text; deployed workers load the active version from PostgreSQL.
import json
from pathlib import Path
SYSTEM = json.loads(Path(__file__).with_name('default-prompt.json').read_text())

def evidence_matches(evidence, text):
    """Compare visible characters; do not relax case, spacing or wording."""
    return html.unescape(evidence) in html.unescape(text)

def validate_label(label, tweet, reference=False):
    if not isinstance(label, dict):
        raise ValueError('label must be an object')
    positive = label.get('is_offer') if reference else label.get('is_notice')
    if type(positive) is not bool:
        raise ValueError('is_notice must be boolean')
    if not positive:
        return {'is_notice': False}
    if label.get('side') not in ('ask', 'offer') or label.get('kind') not in KINDS:
        raise ValueError('invalid side or category')
    summary = label.get('summary')
    if not isinstance(summary, str) or not summary.strip() or len(summary) > 500:
        raise ValueError('invalid summary')
    if type(label.get('standing')) is not bool:
        raise ValueError('standing must be boolean')
    if label.get('respond') not in ('dm', 'reply', 'link', 'like', 'unknown'):
        raise ValueError('invalid response mode')
    topics = label.get('topics')
    if not isinstance(topics, list) or len(topics) > 6 or any(not isinstance(t, str) or len(t) > 80 for t in topics):
        raise ValueError('invalid topics')
    expiry = label.get('expires_at') or None
    if expiry is not None:
        if not isinstance(expiry, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', expiry):
            raise ValueError('invalid expiry')
        dt.date.fromisoformat(expiry)
    place = label.get('place') or None
    if place is not None and (not isinstance(place, str) or len(place) > 160):
        raise ValueError('invalid place')
    evidence = label.get('evidence')
    if not reference and (not isinstance(evidence, str) or not evidence.strip() or not evidence_matches(evidence, tweet['text'])):
        raise ValueError('evidence must be an exact source substring')
    return {'is_notice': True, 'side': label['side'], 'kind': label['kind'],
            'summary': summary.strip(), 'topics': topics, 'respond': label['respond'],
            'standing': label['standing'], 'expires_at': expiry, 'place': place,
            'evidence': evidence if not reference else None}
