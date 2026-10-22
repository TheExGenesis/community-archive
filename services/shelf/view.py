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

# Flavor answers (models.FLAVOR): what the author did with a work. Thresholds give precision
# >= 0.8 on the 200-mention gold set (prototypes/shelf-flavors/MEASURED.md); alludes had only 9
# positives, so it uses an even 0.5.
FLAVOR_KEYS = {"consumption_stated@1": "consumption_stated", "consumption@2": "consumption",
               "reacts@1": "reacts", "pointing@2": "recommends", "cites@1": "cites",
               "alludes@1": "alludes", "judgement@1": "judgement", "sentiment@1": "sentiment"}
FLAVOR_T = {"consumption_stated": .78, "reacts": .54, "recommends": .51, "cites": .75,
            "alludes": .5, "judgement": .66}
SENTIMENT_LEVELS = ["hated", "disliked", "liked", "loved"]
MARK_ORDER = ["loved", "liked", "recommended", "disliked", "hated"]
# Strongest first: a work's relation is the strongest any of its mentions shows. Names are
# medium-neutral (a tool is 'experienced' when used); verbs come from the medium on the page.
RELATIONS = ["made", "experienced", "in_progress", "intends", "not_yet", "discussed", "cited",
             "referenced", "shared", "mentioned"]
# Relations that claim something about the member's own reading or watching. They are part of
# what the owner approves (shelf_worker.content_hash).
CLAIMS = {"experienced", "in_progress", "intends", "not_yet"}


def bare_share(text):
    """A tweet that is only links and @mentions says nothing about the work it links."""
    return not re.sub(r"https?://\S+|@\w+|[\s\W_]", "", text or "")


def mention_flavor(a, tweet):
    """One mention's relation, recommendation and sentiment, or None before flavor answers."""
    if "reacts" not in a:
        return None

    def yes(key):
        value = a.get(key)
        return isinstance(value, (int, float)) and value >= FLAVOR_T[key]

    consumption = a.get("consumption")
    stated = consumption.get("choice") if yes("consumption_stated") and isinstance(consumption, dict) else None
    relation = (stated if stated in CLAIMS
                else "discussed" if yes("reacts") else "cited" if yes("cites")
                else "referenced" if yes("alludes")
                else "shared" if bare_share(tweet.get("text")) else "mentioned")
    sentiment = a.get("sentiment")
    level = None
    if yes("judgement") and isinstance(sentiment, dict):
        level = SENTIMENT_LEVELS[min(3, max(0, round(float(sentiment.get("score", 1.5)))))]
    return {"relation": relation, "recommends": yes("recommends"), "sentiment": level}


def flavor_marks(flavors):
    sentiments = {f["sentiment"] for f in flavors if f["sentiment"]}
    if "loved" in sentiments:
        sentiments.discard("liked")
    if "hated" in sentiments:
        sentiments.discard("disliked")
    if any(f["recommends"] for f in flavors):
        sentiments.add("recommended")
    return [m for m in MARK_ORDER if m in sentiments]

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


# A finer format within a medium, from the namer's free-text kinds; first match wins, then the
# medium's default. Only media whose works split usefully have formats.
FORMATS = {
    "watching": ([("film", r"\b(film|movie|documentary|cinema)"),
                  ("tv", r"\b(tv|television|show|series|episode|season|sitcom|anime)\b")], "video"),
    "listening": ([("podcast", r"\bpodcast"),
                   ("music", r"\b(album|song|music|track|single|ep|playlist|record)\b")], "audio"),
}


def work_format(kinds, med):
    """The format most of a work's mentions name, or None for media without formats."""
    if med not in FORMATS:
        return None
    patterns, default = FORMATS[med]
    found = [next((name for name, rx in patterns if re.search(rx, (k or "").lower())), default)
             for k in kinds]
    return max(set(found), key=found.count) if found else default


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
                                   "url": url, "kinds": [], "tweet_ids": [], "p": {}, "made_votes": [],
                                   "flavors": []})
        w["flavors"].append(mention_flavor(a, tweets[m["tweet_id"]]))
        w["kinds"].append(m["kind"])
        w["creator"] = w["creator"] or m["creator"]
        w["url"] = w["url"] or url
        if m["identity"] != "url" or not w["names"]:
            w["names"].append(m["name"])
        w["made_votes"].append(a.get("made", 0) > MADE)
        if m["tweet_id"] not in w["tweet_ids"]:
            w["tweet_ids"].append(m["tweet_id"])
        for q, p in a.items():
            if isinstance(p, (int, float)):
                w["p"][q] = max(w["p"].get(q, 0), p)
    for w in works.values():
        w["name"] = best_label(w["names"])

    items = []
    for w in works.values():
        p = w["p"]
        flavors = [f for f in w["flavors"] if f]
        if flavors:
            relation = min((f["relation"] for f in flavors), key=RELATIONS.index)
            marks = flavor_marks(flavors)
            engaged = relation not in ("referenced", "shared", "mentioned")
        else:  # before the flavor stage has run for these mentions
            relation = None
            marks = [mk for mk, on in (("loved", p.get("warm", 0) > LOVED),
                                       ("recommended", p.get("pointing", 0) > RECOMMENDED),
                                       ("disliked", p.get("cold", 0) > DISLIKED)) if on]
            engaged = p.get("engaged", 0) > ENGAGED
        med = medium(max(set(w["kinds"]), key=w["kinds"].count))
        # Made needs most mentions to agree: one stray answer across a hundred tweets about
        # a tool must not file it under the member's own work.
        if sum(w["made_votes"]) * 2 > len(w["made_votes"]):
            row, relation = "made", "made"
        elif marks or engaged:
            row = med
        else:
            row = "mentioned"
        label, needs_title = display_name(w["name"], w["url"])
        dates = sorted(tweets[t]["created_at"] for t in w["tweet_ids"])
        items.append({"work_key": w["work_key"], "shelf_row": row, "medium": med, "label": label,
                      "needs_title": needs_title, "creator": w["creator"], "url": w["url"],
                      "marks": marks, "relation": relation, "format": work_format(w["kinds"], med),
                      "first_at": dates[0], "last_at": dates[-1],
                      "evidence_tweet_ids": sorted(w["tweet_ids"], key=lambda t: tweets[t]["created_at"],
                                                   reverse=True),
                      "name": w["name"]})
    items += wikipedia_links(tweets)
    return items


ROW_ORDER = ["made", "books", "reading", "watching", "listening", "playing", "tools", "other",
             "mentioned", "links"]
# Substack mirrors ("…/articles/www-obsolete-pub-p-<slug>.html") and web archives point back to
# the page they copy.
SUBSTACK_MIRROR = re.compile(r"/articles/(?:www-)?(?P<site>[a-z0-9-]+?)-p-(?P<slug>[^/]+?)\.html$")
WEB_ARCHIVE = re.compile(r"^https?://(?:web\.)?archive\.(?:org/web/\d+[a-z_]*|ph|is|today)/(?P<url>https?://.+)$")
# Platforms many people publish on: owning works there says nothing about the rest of it.
SHARED_HOSTS = {"youtube.com", "youtu.be", "github.com", "substack.com", "medium.com", "x.com",
                "twitter.com", "open.spotify.com", "podcasts.apple.com", "docs.google.com",
                "notion.so", "loom.com", "figma.com", "bit.ly", "amazon.com", "goodreads.com"}


def origin_url(url):
    """The page a mirror or archive copies, or the URL itself."""
    if not url:
        return url
    archived = WEB_ARCHIVE.match(url)
    if archived:
        return archived.group("url")
    p = urlparse(url)
    if "substack-proxy" in p.netloc + p.path:
        mirror = SUBSTACK_MIRROR.search(p.path)
        if mirror:
            return f"https://{mirror.group('site').replace('-', '.')}/p/{mirror.group('slug')}"
    return url


def main_title(label):
    """A book's title without its subtitle: "Obsolete: The AI Industry's…" is "obsolete"."""
    return norm(re.split(r"\s*(?::|\s\|\s|\s[-–—]\s)\s*", label, maxsplit=1)[0])


def own_hosts(items):
    """Hosts where most of a member's works are their own (their newsletter, their site)."""
    seen = {}
    for item in items:
        if item.get("url"):
            seen.setdefault(host_of(origin_url(item["url"])), []).append(item["shelf_row"] == "made")
    return {h for h, made in seen.items()
            if h not in SHARED_HOSTS and len(made) >= 3 and sum(made) * 3 >= 2 * len(made)}


def identity_keys(item):
    """Ways two items can be the same work: the same title in the same medium, the same main
    title for books, or the same page once mirrors are unwrapped. Placeholders have none."""
    keys = []
    if item.get("url"):
        keys.append(("url", canonical_url(origin_url(item["url"]))))
    if not item["needs_title"] and item["shelf_row"] != "links":
        # "Happy Together (1997)" in one tweet is "Happy Together" in another.
        keys.append(("title", item.get("medium"), norm(re.sub(r"\s*\((?:19|20)\d{2}\)$", "", item["label"]))))
        # Books and tools often carry a subtitle or tagline after ":" or "–" ("Roam Research –
        # A note taking tool for networked thought"); the main title is the same work.
        if item.get("medium") in ("books", "tools") and len(main_title(item["label"])) >= 4:
            keys.append(("main", item.get("medium"), main_title(item["label"])))
    return keys


def merge_works(items, keep=frozenset()):
    """After titles are resolved, join items that are one work (Out of Control named in one
    tweet and linked on Amazon in another; Obsolete under four subtitles and five store links;
    a post and its Substack mirror) and decide made-or-not from all of their evidence.
    `keep` holds work keys the owner approved; a merged work keeps one of them when it can."""
    hosts = own_hosts(items)
    for item in items:
        if item.get("url"):
            item["url"] = origin_url(item["url"])  # link the post, not its mirror
            if host_of(item["url"]) in hosts and item["shelf_row"] != "links":
                item["shelf_row"] = "made"
    parent = list(range(len(items)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    first_with = {}
    for index, item in enumerate(items):
        for key in identity_keys(item):
            if key in first_with:
                parent[find(index)] = find(first_with[key])
            else:
                first_with[key] = index
    groups = {}
    for index in range(len(items)):
        groups.setdefault(find(index), []).append(items[index])
    return sorted((merge_group(group, keep) for group in groups.values()),
                  key=lambda i: ROW_ORDER.index(i["shelf_row"]))


def merge_group(group, keep):
    if len(group) == 1:
        return group[0]
    weight = lambda i: len(i["evidence_tweet_ids"])  # noqa: E731
    total = sum(weight(i) for i in group)
    by_row = {}
    for item in group:
        by_row[item["shelf_row"]] = by_row.get(item["shelf_row"], 0) + weight(item)
    media_rows = {r: n for r, n in by_row.items() if r not in ("made", "mentioned", "links")}
    if by_row.get("made", 0) * 2 >= total or (by_row.get("made") and not media_rows):
        row = "made"
    elif media_rows:
        row = max(media_rows, key=lambda r: (media_rows[r], -ROW_ORDER.index(r)))
    else:
        row = "mentioned" if "mentioned" in by_row else "links"
    titled = [i for i in group if not i["needs_title"]] or group
    # A book's full title (with a subtitle long enough not to be a truncated page title) wins,
    # then the name used in the most tweets.
    best = max(titled, key=lambda i: (i.get("medium") == "books" and ":" in i["label"]
                                      and len(i["label"]) >= 30, weight(i)))
    approved = [i for i in group if i["work_key"] in keep]
    survivor = max(approved or group, key=weight)
    linked = max((i for i in group if i.get("url")), key=weight, default=None)
    imaged = next((i for i in [best, survivor, *group] if i.get("image_url")), None)
    evidence = sorted({t for i in group for t in i["evidence_tweet_ids"]},
                      key=lambda t: (len(t), t), reverse=True)
    return survivor | {
        "shelf_row": row,
        "label": best["label"],
        "needs_title": best["needs_title"],
        "creator": next((i["creator"] for i in [best, *group] if i.get("creator")), None),
        "url": linked["url"] if linked else survivor.get("url"),
        "marks": [m for m in MARK_ORDER if any(m in i["marks"] for i in group)],
        "relation": "made" if row == "made" else min(
            (i.get("relation") for i in group if i.get("relation") and i.get("relation") != "made"),
            key=RELATIONS.index, default=None),
        "evidence_tweet_ids": evidence,
        "first_at": min(i["first_at"] for i in group),
        "last_at": max(i["last_at"] for i in group),
        "image_url": imaged.get("image_url") if imaged else None,
        "image_source": imaged.get("image_source") if imaged else None,
    }


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
