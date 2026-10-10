"""Derive the member-facing shelf from facts. Pure functions, no I/O.

Mentions of the same work merge into one item. Each item sits in exactly one row: its medium,
"made" (the member made it), or "mentioned" (only mentioned: not engaged, loved, disliked or
recommended). Stance is a mark on the item, never a row. Wikipedia links form a "links" row
taken from URLs in code. Thresholds were chosen on a 300-tweet gold set for precision
(prototypes/shelf/research/notes/shelf-view.md).
"""
import re
from urllib.parse import parse_qs, unquote, urlparse

LOVED, DISLIKED, RECOMMENDED, ENGAGED, MADE, IS_WORK = .8, .7, .5, .5, .5, .5

# Links to tweets (and Twitter mirrors) are never works on a shelf.
TWEET_HOSTS = {"x.com", "twitter.com", "mobile.twitter.com", "nitter.net", "xcancel.com",
               "fxtwitter.com", "vxtwitter.com", "fixupx.com", "threadreaderapp.com"}
# Twitter itself and its mirrors are the medium the archive is made of; on every shelf they
# would say nothing about the member.
TWITTER_NAMES = {"twitter", "x", "xcom", "nitter", "xcancel", "twittercom"}
# Words a product handle adds to the product's name: @RoamResearch, @NotionHQ.
HANDLE_SUFFIXES = ("research", "official", "app", "hq", "inc")

# Medium from the namer's free-text kind; first match wins. Watching appears twice: strong
# words before Tools, weak ones ("series", "show") after, so "GPT-5 series" is a tool.
MEDIA = [
    ("books", r"\b(book|novel|e-?book|chapter|memoir|anthology)\b"),
    ("listening", r"\b(podcast|album|song|music|audio|playlist|track)\b"),
    ("watching", r"\b(video|film|movie|documentary|youtube)"),
    ("playing", r"\b(game)"),
    ("reading", r"\b(article|essay|paper|post|blog|report|letter|piece|newsletter|op-?ed|"
                r"study|thread|wiki|page|website|site|story|column|review|interview|comic)"),
    ("tools", r"\b(app|tool|software|product|model|platform|service|extension|plugin|"
              r"librar|framework|device|editor|browser|benchmark|language|font|hardware|"
              r"gpu|chip|system|assistant|chatbot|ai\b)"),
    ("watching", r"\b(show|series|lecture|talk|tv)"),
]
MEDIA_HOSTS = {"youtu.be": "YouTube video", "youtube.com": "YouTube video",
               "open.spotify.com": "Spotify item", "arxiv.org": "arXiv paper",
               "bit.ly": "Shortened link"}


def medium(kind):
    k = (kind or "").lower()
    return next((name for name, rx in MEDIA if re.search(rx, k)), "other")


def host_of(url):
    return urlparse(url).netloc.lower().removeprefix("www.").removeprefix("m.")


def youtube_id(url):
    p = urlparse(url)
    host = host_of(url)
    if host == "youtu.be":
        return p.path.strip("/") or None
    if host.endswith("youtube.com"):
        return (parse_qs(p.query).get("v") or [None])[0]
    return None


def canonical_url(url):
    vid = youtube_id(url)
    if vid:
        return "youtube:" + vid
    p = urlparse(url)
    return host_of(url) + p.path.rstrip("/").lower()


def norm(text):
    return re.sub(r"[^a-z0-9]", "", (text or "").lower())


def name_key(name, kind):
    key = norm(name.lstrip("@"))
    if medium(kind) == "tools":
        for suffix in HANDLE_SUFFIXES:
            if key.endswith(suffix) and len(key) > len(suffix) + 2:
                return key[: -len(suffix)]
    return key


def work_key(m, made):
    if m["identity"] == "url" and m["surface"].startswith("http"):
        return "url:" + canonical_url(m["surface"])
    if m["identity"] == "unnamed":
        # "my book" across tweets is one work; other unnamed references stay separate.
        return f"unnamed:{norm(m['name'])}" if made else f"unnamed:{m['tweet_id']}:{norm(m['name'])}"
    return "name:" + (name_key(m["name"], m["kind"]) or m["id"])


PLAYABLE_HOSTS = ("youtu.be", "youtube.com", "vimeo.com", "open.spotify.com", "podcasts.apple.com")


def attached_media_url(m, tweet):
    """A video or podcast named in the text ("Stop Drawing Dead Fish") usually comes with its
    link in the same tweet. Attach it when the tweet has exactly one such link."""
    if m["identity"] == "url" or medium(m["kind"]) not in ("watching", "listening"):
        return None
    links = [u for u in tweet["urls"] if host_of(u).endswith(PLAYABLE_HOSTS)]
    return links[0] if len(links) == 1 else None


def is_tweet_link(surface):
    return surface.startswith("http") and host_of(surface) in TWEET_HOSTS


def best_label(names):
    """The most readable of the names a work was given: frequent, spaced, capitalised, no @."""
    def score(n):
        return (" " in n.strip(), not n.startswith("@"), names.count(n), n[:1].isupper())
    return max(set(names), key=score).lstrip("@")


def display_name(name, url):
    """What a member sees: the title, or an honest stand-in when the tweet gives none."""
    if name.startswith("(unnamed"):
        return f"Untitled {name[9:-1]}", True
    if url:
        kind = MEDIA_HOSTS.get(host_of(url))
        bare = name.strip()
        tail = urlparse(url).path.rstrip("/").rsplit("/", 1)[-1]
        looks_like_id = (bare.startswith("http") or bare == tail or (kind and " " not in bare)
                         or (" " not in bare and bool(re.search(r"\d", bare))))
        if looks_like_id:
            return kind or host_of(url), True
    return name, False


def build(tweets, mentions, answers):
    """tweets: {tweet_id: {created_at, urls}}; mentions: mention rows; answers: {mention_id: {q: p}}.

    Returns a list of item dicts ready for shelf.items (minus account_id and images)."""
    works = {}
    for m in mentions:
        a = answers.get(m["id"])
        if not m["verbatim"] or not a or m["tweet_id"] not in tweets or is_tweet_link(m["surface"]):
            continue
        if a.get("is_work", 1) < IS_WORK:  # people, ideas, organisations, accounts
            continue
        if norm(m["name"].lstrip("@")) in TWITTER_NAMES:
            continue
        key = work_key(m, a.get("made", 0) > MADE)
        url = m["surface"] if m["surface"].startswith("http") else attached_media_url(m, tweets[m["tweet_id"]])
        w = works.setdefault(key, {"work_key": key, "names": [], "creator": m["creator"],
                                   "url": url, "kinds": [], "tweet_ids": [], "p": {}, "made_votes": []})
        w["kinds"].append(m["kind"])
        w["creator"] = w["creator"] or m["creator"]
        w["url"] = w["url"] or url
        if m["identity"] != "url" or not w["names"]:
            w["names"].append(m["name"])
        w["made_votes"].append(a.get("made", 0) > MADE)
        if m["tweet_id"] not in w["tweet_ids"]:
            w["tweet_ids"].append(m["tweet_id"])
        for q, p in a.items():
            w["p"][q] = max(w["p"].get(q, 0), p)
    for w in works.values():
        w["name"] = best_label(w["names"])

    items = []
    for w in works.values():
        p = w["p"]
        marks = [mk for mk, on in (("loved", p.get("warm", 0) > LOVED),
                                   ("recommended", p.get("pointing", 0) > RECOMMENDED),
                                   ("disliked", p.get("cold", 0) > DISLIKED)) if on]
        med = medium(max(set(w["kinds"]), key=w["kinds"].count))
        # Made needs most mentions to agree: one stray answer across a hundred tweets about
        # a tool must not file it under the member's own work.
        if sum(w["made_votes"]) * 2 > len(w["made_votes"]):
            row = "made"
        elif marks or p.get("engaged", 0) > ENGAGED:
            row = med
        else:
            row = "mentioned"
        label, needs_title = display_name(w["name"], w["url"])
        dates = sorted(tweets[t]["created_at"] for t in w["tweet_ids"])
        items.append({"work_key": w["work_key"], "shelf_row": row, "medium": med, "label": label,
                      "needs_title": needs_title, "creator": w["creator"], "url": w["url"],
                      "marks": marks, "first_at": dates[0], "last_at": dates[-1],
                      "evidence_tweet_ids": sorted(w["tweet_ids"], key=lambda t: tweets[t]["created_at"],
                                                   reverse=True),
                      "name": w["name"]})
    items += wikipedia_links(tweets)
    return items


def merge_same_titles(items):
    """After titles are resolved, a work named in one tweet and linked in another can carry
    the same label in the same row (Out of Control by name and by Amazon link): merge them."""
    order = ["made", "books", "reading", "watching", "listening", "playing", "tools", "other",
             "mentioned", "links"]
    merged = {}
    for item in items:
        if item["needs_title"]:
            merged[("#", item["work_key"])] = item
            continue
        key = (item["shelf_row"], norm(item["label"]))
        if key not in merged:
            merged[key] = item
            continue
        keep = merged[key]
        ids = keep["evidence_tweet_ids"] + [t for t in item["evidence_tweet_ids"]
                                            if t not in keep["evidence_tweet_ids"]]
        keep.update(evidence_tweet_ids=ids, first_at=min(keep["first_at"], item["first_at"]),
                    last_at=max(keep["last_at"], item["last_at"]),
                    marks=[m for m in ("loved", "recommended", "disliked")
                           if m in keep["marks"] or m in item["marks"]],
                    creator=keep["creator"] or item["creator"],
                    image_url=keep.get("image_url") or item.get("image_url"),
                    image_source=keep.get("image_source") or item.get("image_source"))
    return sorted(merged.values(), key=lambda i: order.index(i["shelf_row"]))


def wikipedia_links(tweets):
    links = {}
    for tid, t in tweets.items():
        for u in t["urls"]:
            if "wikipedia.org/wiki/" in u:
                link = links.setdefault("link:" + canonical_url(u), {"url": u, "tweet_ids": []})
                link["tweet_ids"].append(tid)
    out = []
    for key, link in links.items():
        title = unquote(link["url"].split("/wiki/", 1)[1].split("#")[0]).replace("_", " ")
        dates = sorted(tweets[t]["created_at"] for t in link["tweet_ids"])
        out.append({"work_key": key, "shelf_row": "links", "medium": "reading", "label": title,
                    "needs_title": False, "creator": None, "url": link["url"], "marks": [],
                    "first_at": dates[0], "last_at": dates[-1], "name": title,
                    "evidence_tweet_ids": sorted(link["tweet_ids"], key=lambda t: tweets[t]["created_at"],
                                                 reverse=True)})
    return out
