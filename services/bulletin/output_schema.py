"""Wire-format constraints; semantic and source-evidence checks remain in Python."""
from labels import KINDS

RULES = '''Return the single top-level object required by the response schema.
For a positive notice, side, kind, and respond must each be ONE listed value,
never a combined value or display label. When several response methods are
offered, choose the first explicitly mentioned supported method; otherwise unknown.
For a negative, set is_notice=false, side/kind/summary/respond/evidence to null,
topics to [], standing to false, expires_at/place to null, and availability to
{"state":"unknown","tweet_id":null,"evidence":null}.'''

PROPERTIES = {
    'is_notice': {'type': 'boolean'},
    'side': {'type': ['string', 'null'], 'enum': ['ask', 'offer', None]},
    'kind': {'type': ['string', 'null'], 'enum': KINDS + [None]},
    'summary': {'type': ['string', 'null']},
    'topics': {'type': 'array', 'items': {'type': 'string'}},
    'respond': {'type': ['string', 'null'], 'enum': ['dm', 'reply', 'link', 'like', 'unknown', None]},
    'standing': {'type': 'boolean'},
    'expires_at': {'type': ['string', 'null']},
    'place': {'type': ['string', 'null']},
    'evidence': {'type': ['string', 'null']},
    'availability': {
        'type': 'object', 'additionalProperties': False,
        'properties': {
            'state': {'type': 'string', 'enum': ['unknown', 'open', 'resolved']},
            'tweet_id': {'type': ['string', 'null']},
            'evidence': {'type': ['string', 'null']},
        },
        'required': ['state', 'tweet_id', 'evidence'],
    },
}
FORMAT = {'type': 'json_schema', 'json_schema': {
    'name': 'bulletin_notice', 'strict': True,
    'schema': {'type': 'object', 'additionalProperties': False,
        'properties': PROPERTIES, 'required': list(PROPERTIES)},
}}
