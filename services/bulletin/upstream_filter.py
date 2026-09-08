"""Exact filter and prompt/schema excerpts from MaskyS/bulletin.
Source: https://raw.githubusercontent.com/MaskyS/bulletin/143dc2de36ec7c63f039d579958a0d51bf2aee6c/pipeline/classify.py
Full source SHA256: c0de717c233ccf280fa8242b52e18859e9319797e0bb88200033dccabddf85b3
No upstream model client or executable pipeline is imported.
"""
import re
import html

KINDS = [
    {"id": "help", "label": "Help & skills"},
    {"id": "feedback", "label": "Feedback & review"},
    {"id": "intro", "label": "Intros & leads"},
    {"id": "free", "label": "Free sessions"},
    {"id": "invite", "label": "Invites & spaces"},
    {"id": "opportunity", "label": "Opportunities"},
]

KIND_IDS = [k["id"] for k in KINDS]

RESPOND = ["dm", "reply", "link", "like"]

OFFER = re.compile(
    r"standing offer"
    r"|(happy|glad|down|available|keen|willing|more than happy) to (help|assist|chat|pair|review|advise|consult|jump|hop|talk)"
    r"|(dm|message|ping|reach out to|hmu|hit me up) me\b"
    r"|reach out (to me|if you)"
    r"|i('|’)?m offering|i offer\b|i can offer|offering (free|to|my|a|up|help)"
    r"|office hours"
    r"|for free|no charge|pro bono|free of charge"
    r"|if (you|anyone|any of you|y'?all|you all|folks|someone)[^.]{0,40}(need|want|are looking|would like|could use)"
    r"|(want|happy|glad) to help"
    r"|let me know if (you|anyone)"
    r"|hmu if|holler if",
    re.I,
)

REQUEST = re.compile(
    r"^\s*(i need|i really need|need help|can (someone|anyone) help me|help me\b|looking for someone"
    r"|does anyone (know|have)|any recs|anyone know how|how do i|pls help|please help)",
    re.I,
)

STRONG = re.compile(r"standing offer|i('|’)?m offering|office hours|dm me|reach out|happy to help", re.I)

ASK = re.compile(
    r"^(does|do) anyone|anyone (know|have|recommend|got|using|tried)"
    r"|looking for (a|an|some|someone|anyone|recs|recommendations|people|folks)"
    r"|any (recs|recommendations|tips|leads|suggestions)"
    r"|who should i (talk|ask|follow|read)|seeking (a|an|help|someone|collaborators?)"
    r"|^wanted:|^ask:|can (someone|anyone) (help|point|recommend|explain)"
    r"|need (a|an|some|help|advice|an intro|recommendations)",
    re.I,
)

CONVENTION = re.compile(r"^(standing offer|offer|ask|wanted)\s*:", re.I)

def side_of(text):
    """'offer', 'ask', or None. Cheap prefilter; the labeler has the final say."""
    if len(text) < 25:
        return None
    m = CONVENTION.match(text)
    if m:
        return "ask" if m.group(1).lower() in ("ask", "wanted") else "offer"
    if OFFER.search(text) and not (REQUEST.search(text) and not STRONG.search(text)):
        return "offer"
    if ASK.search(text) or REQUEST.search(text):
        return "ask"
    return None

def clean_text(text):
    """Verbatim tweet, minus t.co stubs and the leading @mentions of a reply."""
    text = html.unescape(text)
    text = re.sub(r"https?://t\.co/\w+", "", text)
    text = re.sub(r"^(\s*@\w+)+\s+", "", text)
    text = re.sub(r"[ \t]+\n", "\n", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()

LABEL_SCHEMA = {
    "type": "object",
    "properties": {
        "is_offer": {"type": "boolean", "description": "True if this is a notice for the board: the author offers something to others, or asks the group for something."},
        "side": {"type": "string", "enum": ["offer", "ask"], "description": "offer = author gives; ask = author wants."},
        "kind": {"type": "string", "enum": KIND_IDS},
        "summary": {"type": "string", "description": "One sentence, third person, what is on offer. No hype."},
        "topics": {"type": "array", "items": {"type": "string"}, "description": "2 to 4 lowercase subject tags."},
        "respond": {"type": "string", "enum": RESPOND, "description": "How the author asked people to respond."},
        "standing": {"type": "boolean", "description": "True if the offer is open indefinitely."},
        "expires_at": {"type": "string", "description": "YYYY-MM-DD if the offer has an end date, else empty."},
        "place": {"type": "string", "description": "City or region if the offer is tied to one, else empty."},
        "confidence": {"type": "number"},
    },
    "required": ["is_offer", "side", "kind", "summary", "topics", "respond", "standing", "expires_at", "place", "confidence"],
    "additionalProperties": False,
}

SYSTEM = (
    "You label tweets for a community notice board. The board lists offers people make to "
    "the group and asks they make of it: help with a skill, feedback on work, introductions, "
    "free sessions, invitations to a space or event, and opportunities like roles or funding. "
    "Decide whether the tweet is a genuine offer to other people or a genuine ask of them. "
    "Commentary, jokes, rhetorical questions, and product promotion are neither. Fill the "
    "label only when it is one."
)
