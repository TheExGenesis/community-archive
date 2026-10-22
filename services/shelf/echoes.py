"""Echoes: other members who tweeted about a work on a shelf. Pure functions, no I/O.

Matching is deterministic; no model ever reads another member's tweets. A work echoes in a
tweet when the tweet links to the same canonical URL, or names it in a way that means the
work and not the phrase: with its creator's name, or written as a title next to a word for
its medium ("reading The Alignment Problem", not "the alignment problem is hard").
"""
import re
from urllib.parse import parse_qs, urlparse

import view

# Rows whose works are specific enough to say "these people tweeted about it too". Tools
# ("ChatGPT, and 300 others") and the catch-all rows say nothing.
ECHO_ROWS = ("books", "reading", "watching", "listening", "playing", "made")
STOPWORDS = {"a", "an", "and", "as", "at", "be", "by", "for", "from", "how", "i", "in", "is",
             "it", "my", "of", "on", "or", "out", "the", "to", "up", "what", "when", "why",
             "with", "you", "your"}
MIN_CONTENT_WORDS, MIN_TITLE_CHARS = 2, 12
# A title alone counts only next to one of these words for the work's medium.
MEDIUM_CUES = {
    "books": {"book", "books", "read", "reading", "reread", "author", "novel", "chapter", "audiobook"},
    "reading": {"read", "reading", "essay", "article", "post", "paper", "piece", "blog"},
    "watching": {"watch", "watched", "watching", "film", "movie", "documentary", "episode", "show",
                 "series", "video", "talk", "lecture"},
    "listening": {"listen", "listened", "listening", "podcast", "episode", "album", "song"},
    "playing": {"game", "play", "played", "playing"},
}
MATCHER = "echo@2"
# Query keys that never identify a page (shares, referrers, timestamps).
TRACKING_PARAMS = {"s", "si", "t", "ref", "ref_src", "source", "share", "fbclid", "gclid", "igshid"}
TOKEN = re.compile(r"[A-Za-z0-9_]+")  # underscores keep handles like @dan_nott whole


def tokens(text):
    """Word tokens with their original case; possessives drop their 's ("Kelly's" is "Kelly")."""
    return TOKEN.findall(re.sub(r"['’]s\b", "", text or ""))


def words(text):
    return [t.lower() for t in tokens(text)]


def creator_names(creator):
    """Handles (without @) and surnames in a creator string such as "Kevin Kelly" or
    "@kevinsimler and @robinhanson"; tokens shorter than three letters are dropped."""
    names = set()
    for part in re.split(r"\s*(?:,|&|\band\b)\s*", creator or ""):
        part = part.strip()
        if not part:
            continue
        last = part.split()[-1].lstrip("@").lower()
        last = re.sub(r"[^a-z0-9_]", "", last)
        if len(last) >= 3:
            names.add(last)
    return names


def title_rule(label, creator, row):
    """How a named work may be matched, or None: {"phrase", "names", "cues", "content"}."""
    phrase = " ".join(words(label))
    content = [w for w in words(label) if w not in STOPWORDS]
    if not content or len(phrase) < 6:
        return None
    if re.fullmatch(r"@?\w+", label.strip()) and ("_" in label or label.strip().startswith("@")):
        return None  # a handle names an account, not a work: "comm_archive"
    distinctive = len(content) >= MIN_CONTENT_WORDS and len(phrase) >= MIN_TITLE_CHARS
    rule = {"phrase": phrase, "names": creator_names(creator),
            "cues": MEDIUM_CUES.get(row, set()) if distinctive else set(),
            "content": set(content)}
    return rule if rule["names"] or rule["cues"] else None


def link_key(url):
    """Canonical URL of a link, or None when it cannot identify one work: a bare site, a tweet,
    or a page whose identity is its query string (youtube.com/playlist?list=…, item?id=…)."""
    if not url or not url.startswith("http"):
        return None
    key = view.canonical_url(url)
    if key.startswith("youtube:"):
        return key if len(key) > len("youtube:") else None
    host = view.host_of(url)
    p = urlparse(url)
    if key == host or host in view.TWEET_HOSTS:
        return None
    identifying = [k for k in parse_qs(p.query) if not k.lower().startswith("utm_")
                   and k.lower() not in TRACKING_PARAMS]
    if identifying and len([s for s in p.path.split("/") if s]) <= 1:
        return None
    return key


def targets(items):
    """What to look for: {work_key: {"link": canonical or None, "title": rule or None}}."""
    out = {}
    for item in items:
        if item["shelf_row"] not in ECHO_ROWS:
            continue
        link = link_key(item.get("url"))
        # Titles only for works the member named in text; a linked work matches by its link,
        # and page titles ("X | Site") are rarely repeated word for word.
        named = item["work_key"].startswith("name:") and not item.get("needs_title")
        title = title_rule(item["label"], item.get("creator"), item["shelf_row"]) if named else None
        if link or title:
            out[item["work_key"]] = {"link": link, "title": title}
    return out


def find_phrase(lower_words, phrase_words):
    n = len(phrase_words)
    return [i for i in range(len(lower_words) - n + 1) if lower_words[i:i + n] == phrase_words]


def names_title(rule, original, lower):
    """Whether a tweet (its tokens, original case and lowercase) names the work."""
    phrase_words = rule["phrase"].split()
    starts = find_phrase(lower, phrase_words)
    if not starts:
        return False
    if rule["names"] & set(lower):
        return True
    if not rule["cues"] & set(lower):
        return False
    # Written as a title: every content word capitalised at one of the occurrences.
    return any(all(original[i + j][:1].isupper() for j, w in enumerate(phrase_words)
                   if w in rule["content"]) for i in starts)


def match(targets_by_key, tweets, owner_id):
    """tweets: [{tweet_id, account_id, text, urls, is_retweet}] from any member.

    Returns {(work_key, account_id): {"tweet_ids": [...], "match": "url"|"title"}}; a URL
    match wins over a title match for the same person."""
    by_link = {}
    titles = []
    for key, t in targets_by_key.items():
        if t["link"]:
            by_link.setdefault(t["link"], []).append(key)
        if t["title"]:
            titles.append((key, t["title"]))
    out = {}

    def add(key, account_id, tweet_id, kind):
        e = out.setdefault((key, account_id), {"tweet_ids": [], "match": kind})
        if tweet_id not in e["tweet_ids"]:
            e["tweet_ids"].append(tweet_id)
        if kind == "url":
            e["match"] = "url"

    for tw in tweets:
        if tw["account_id"] == owner_id or tw.get("is_retweet") or tw["text"].startswith("RT @"):
            continue
        for u in tw["urls"]:
            for key in by_link.get(link_key(u) or "", ()):
                add(key, tw["account_id"], tw["tweet_id"], "url")
        original = tokens(tw["text"])
        lower = [t.lower() for t in original]
        for key, rule in titles:
            if names_title(rule, original, lower):
                add(key, tw["account_id"], tw["tweet_id"], "title")
    return out
