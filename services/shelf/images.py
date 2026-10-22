"""Titles and images for shelf items, from public sources that allow it.

Sources (prototypes/shelf/research/notes/impl-images.md):
  youtube     oEmbed title + i.ytimg.com thumbnail by video id (no key; credit YouTube)
  spotify     oEmbed title + thumbnail (no key)
  openlibrary search.json → covers.openlibrary.org by cover id (hotlinking is the intended use)
  og          og:image / og:title from the linked page (public https only)
  favicon     DuckDuckGo icon for a tool's domain
Results are cached in shelf.resolutions so each work is looked up once across accounts.
Only https image URLs are kept; the website proxies them through /api/shelf/cover.
"""
import html
import http.client
import ipaddress
import json
import re
import socket
import ssl
import string
import time
import unicodedata
import urllib.parse

from view import host_of, norm, youtube_id

USER_AGENT = "CommunityArchiveShelf/0.1 (+https://github.com/TheExGenesis/community-archive)"
_last_call = {}


class LookupFailed(Exception):
    """A lookup that could not be made (network, rate limit, server error). Unlike a miss it
    is not cached, so the next run asks again."""


def _polite(host, gap):
    wait = _last_call.get(host, 0) + gap - time.monotonic()
    if wait > 0:
        time.sleep(wait)
    _last_call[host] = time.monotonic()


def _global_ip(host):
    """One resolved address for host, or None unless every address is publicly routable."""
    try:
        infos = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
        ips = [ipaddress.ip_address(info[4][0]) for info in infos]
    except (socket.gaierror, ValueError, UnicodeError):
        return None
    return str(ips[0]) if ips and all(ip.is_global for ip in ips) else None


def _public_https(url):
    p = urllib.parse.urlparse(url)
    return (p.scheme == "https" and bool(p.hostname) and p.port in (None, 443)
            and _global_ip(p.hostname) is not None)


class _PinnedHTTPS(http.client.HTTPSConnection):
    """Connects to an address validated beforehand, so DNS cannot change between the check
    and the connection; TLS still verifies the certificate for the original host name."""

    def __init__(self, host, ip):
        super().__init__(host, 443, timeout=10, context=ssl.create_default_context())
        self._ip = ip

    def connect(self):
        sock = socket.create_connection((self._ip, 443), self.timeout)
        self.sock = self._context.wrap_socket(sock, server_hostname=self.host)


def _get(url, gap=1.0, limit=1_500_000, accept="application/json", hops=3, strict=False):
    """GET a public https URL. Every redirect hop is validated and pinned the same way.
    Plain http links are tried over https. Any failure returns None; with strict, a failure
    that is not the server's answer (no address, network, 429, 5xx) raises LookupFailed."""
    if url.startswith("http://"):
        url = "https://" + url[7:]
    for _ in range(hops + 1):
        p = urllib.parse.urlparse(url)
        if p.scheme != "https" or not p.hostname or p.port not in (None, 443):
            return None
        ip = _global_ip(p.hostname)
        if ip is None:
            if strict:
                raise LookupFailed(f"no public address for {p.hostname}")
            return None
        _polite(p.hostname, gap)
        conn = _PinnedHTTPS(p.hostname, ip)
        try:
            conn.request("GET", (p.path or "/") + (f"?{p.query}" if p.query else ""),
                         headers={"User-Agent": USER_AGENT, "Accept": accept, "Host": p.hostname})
            response = conn.getresponse()
            if response.status in (301, 302, 303, 307, 308):
                location = response.getheader("Location")
                if not location:
                    return None
                url = urllib.parse.urljoin(url, location)
                continue
            if response.status != 200:
                if strict and (response.status == 429 or response.status >= 500):
                    raise LookupFailed(f"{p.hostname} answered {response.status}")
                return None
            return response.read(limit), response.getheader("Content-Type", "")
        except (OSError, http.client.HTTPException, ssl.SSLError, ValueError) as e:
            if strict:
                raise LookupFailed(f"{p.hostname}: {e}") from e
            return None
        finally:
            conn.close()
    return None


def _json(url, gap=1.0, strict=False):
    got = _get(url, gap, strict=strict)
    if not got:
        return None
    try:
        return json.loads(got[0])
    except ValueError:
        return None


def _https(url):
    return url if url and url.startswith("https://") else None


def resolution_key(item):
    key = _resolution_key(item)
    return key[:400] if key else None


def poster_key(item):
    """A film or show is known by its poster, not by a linked trailer's frame or a review page's
    image, so a linked one is looked up by name first; the link's image is the fallback."""
    if (item.get("url") and item["medium"] == "watching" and item.get("format") in ("film", "tv")
            and item.get("name") and not item["needs_title"]):
        return f"screen:{norm(item['name'])}|{norm(item.get('creator'))}"[:400]
    return None


def _resolution_key(item):
    url = item.get("url")
    if url:
        vid = youtube_id(url)
        if vid:
            return "youtube:" + vid
        if host_of(url) == "open.spotify.com":
            return "spotify:" + url.split("?")[0]
        return "url:" + url.split("#")[0][:380]
    if item["needs_title"]:
        return None
    if item["shelf_row"] == "books" or item["medium"] == "books":
        return f"book:{norm(item['name'])}|{norm(item.get('creator'))}"[:400]
    if item["medium"] == "tools":
        return f"tool:{norm(item['name'])}"
    kind = WIKI_KINDS.get(item["medium"]) or WIKI_KINDS.get(item["shelf_row"])
    if kind:
        return f"{kind}:{norm(item['name'])}|{norm(item.get('creator'))}"[:400]
    return None


def resolve(key, item):
    """Returns {title, image_url, source, found}. An image is kept only if it loads as an image."""
    found = _resolve(key, item)
    if found["image_url"] and not is_image(found["image_url"]):
        found = found | {"image_url": None, "found": bool(found["title"])}
    return found


def is_image(url):
    got = _get(url, gap=0.2, limit=4096, accept="image/*")
    return bool(got) and got[1].lower().startswith("image/")


def _resolve(key, item):
    kind, _, rest = key.partition(":")
    if kind == "youtube":
        meta = _json("https://www.youtube.com/oembed?format=json&url="
                     + urllib.parse.quote(f"https://www.youtube.com/watch?v={rest}"), gap=0.3, strict=True)
        if not meta:
            return {"title": None, "image_url": None, "source": "youtube", "found": False}
        return {"title": meta.get("title"), "image_url": f"https://i.ytimg.com/vi/{rest}/hqdefault.jpg",
                "source": "youtube", "found": True}
    if kind == "spotify":
        target = (item.get("url") or rest).split("?")[0]
        meta = _json("https://open.spotify.com/oembed?url=" + urllib.parse.quote(target), gap=0.5, strict=True)
        return {"title": (meta or {}).get("title"), "image_url": _https((meta or {}).get("thumbnail_url")),
                "source": "spotify", "found": bool(meta)}
    if kind == "book":
        return openlibrary(item["name"], item.get("creator"))
    if kind == "tool":
        return tool_icon(item["name"])
    if kind in WIKI_DESCRIBES:
        return wikipedia(item["name"], item.get("creator"), kind)
    if kind == "url":
        target = item.get("url") or rest  # the key may be truncated; the item has the full URL
        found = og(target)
        if found["found"]:
            return found
        if item["medium"] == "tools":
            return favicon(target)
        return found
    return {"title": None, "image_url": None, "source": "none", "found": False}


STOP = {"the", "a", "an", "of", "and"}


def _fold(text):
    """Lowercase without accents, so "amelie" is "Amélie"."""
    text = unicodedata.normalize("NFKD", text or "")
    return "".join(c for c in text if not unicodedata.combining(c)).lower()


def _tokens(text):
    return set(re.findall(r"[a-z0-9]+", re.sub(r"['’]", "", _fold(text)))) - STOP


def similarity(a, b):
    ta, tb = _tokens(a), _tokens(b)
    return len(ta & tb) / len(ta | tb) if ta and tb else 0.0


def _words(text):
    return re.findall(r"[a-z0-9]+", re.sub(r"['’]", "", _fold(text)))


def starts_with(name, title):
    """A series or short name that opens a book's title: "Harry Potter" and "Harry Potter and
    the Philosopher's Stone". Needs two words that are not stop words, so "Memorial" or
    "The Hike" never takes a longer title."""
    a, b = _words(name), _words(title)
    return len([w for w in a if w not in STOP]) >= 2 and len(b) > len(a) and b[: len(a)] == a


def openlibrary(title, creator):
    """Title search; keep a result only if a title matches and a cover exists. A work's own
    title can be the original language's ("Le città invisibili"), so its English edition's
    title counts too, and that edition's cover is preferred. The author joins the search only
    when it reads as a name: a tweet's "@sapinker" or "kevinsimlerandrobinhanson" finds nothing."""
    person = creator if creator and "@" not in creator and " " in creator.strip() else ""
    q = urllib.parse.urlencode({
        "q": f"{title} {person}".strip(), "limit": 5, "lang": "en",
        "fields": "key,title,author_name,cover_i,language,editions,editions.title,editions.cover_i"})
    data = _json(f"https://openlibrary.org/search.json?{q}", gap=1.0, strict=True)
    if data is None:
        raise LookupFailed("Open Library search did not answer")

    def author_match(d):
        return bool(creator) and any(similarity(creator, a) for a in d.get("author_name") or [])

    def edition(d):
        return ((d.get("editions") or {}).get("docs") or [{}])[0]

    def titles(d):
        return [t for t in (edition(d).get("title"), d.get("title")) if t]

    def best(d):
        return max(titles(d), key=lambda t: similarity(title, t))

    # A stated creator must match, unless the title match is near-exact: creators taken from
    # tweets are often handles that no catalogue knows.
    def matches(d):
        score = similarity(title, best(d))
        return score >= 0.8 or ((score >= 0.6 or any(starts_with(title, t) for t in titles(d)))
                                and (not creator or author_match(d)))

    docs = [d for d in data.get("docs", []) if (edition(d).get("cover_i") or d.get("cover_i")) and matches(d)]
    docs.sort(key=lambda d: (not author_match(d), "eng" not in (d.get("language") or [])))
    if not docs:
        return {"title": None, "image_url": None, "source": "openlibrary", "found": False}
    top = docs[0]
    cover = edition(top).get("cover_i") or top["cover_i"]
    # -L (about 500px wide): -M is blurry on large tiles and high-density screens.
    return {"title": best(top), "image_url": f"https://covers.openlibrary.org/b/id/{cover}-L.jpg",
            "source": "openlibrary", "found": True}


WIKI_KINDS = {"watching": "screen", "playing": "game", "listening": "listen"}
# What a page's short description must say for each kind of work, so "Portal" finds the game
# and never the disambiguation page or the web portal.
WIKI_DESCRIBES = {
    "screen": re.compile(r"\b(film|movie|television|tv|series|miniseries|sitcom|anime|documentary)\b", re.I),
    "game": re.compile(r"\bgames?\b", re.I),
    "listen": re.compile(r"\b(album|ep|mixtape|soundtrack|song|single|podcast)\b", re.I),
}


def wikipedia(name, creator, kind):
    """A film, show, game, album or song's lead image from its English Wikipedia page. First the
    page titles such a work would have ("Her (film)", "Happy Together (1997 film)", "Sunbather
    (album)"), whose redirects also catch other names ("Hausu", "EEAAO"); then a search. A page
    counts when its short description says it is that kind of work and, from a search, its title
    matches. A year in the name ("The Fountain (2006)") picks that year's release. Music names
    repeat ("Blonde", "Nights"), so a music page must also name the artist, or the title must have
    two real words. Many such images are non-free uploads; the shelf credits Wikipedia under the
    grid."""
    dated = re.fullmatch(r"(.*\S)\s*\((\d{4})\)", name.strip())
    name, year = (dated.group(1), dated.group(2)) if dated else (name.strip(), None)
    person = creator if creator and "@" not in creator else ""
    found = _wiki_titles(name, person, kind, year)
    if found:
        return found
    queries = {"screen": [name, f"{name} film", f"{name} TV series"],
               "game": [name, f"{name} video game"],
               "listen": [f"{name} {person}".strip(), f"{name} album"]}[kind]
    for q in dict.fromkeys(queries):
        found = _wiki_page(q, name, person, kind, year)
        if found:
            return found
    return {"title": None, "image_url": None, "source": "wikipedia", "found": False}


# A page title's qualifier, "(film)", "(1997 film)", "(Frank Ocean album)", but not a parenthesis
# that belongs to the title itself, as in "Lions, Love (...and Lies)".
QUALIFIER = re.compile(r"\s*\((?:[^()]*\b(?:film|movie|series|tv|miniseries|show|game|album|song|ep|single|"
                       r"soundtrack|podcast|anime|band|novel|book)\b[^()]*|\d{4})\)$", re.I)
WIKI_PROPS = {"prop": "pageimages|description", "piprop": "thumbnail", "pithumbsize": 500,
              "pilicense": "any", "redirects": 1}


def _wiki_api(params, what):
    query = urllib.parse.urlencode({"action": "query", "format": "json", "formatversion": 2, **params})
    data = _json(f"https://en.wikipedia.org/w/api.php?{query}", gap=0.5, strict=True)
    if data is None:
        raise LookupFailed(f"Wikipedia {what} did not answer")
    return data.get("query", {})


def _wiki_fits(page, kind, artist, year):
    description = page.get("description") or ""
    if page.get("missing") or not WIKI_DESCRIBES[kind].search(description):
        return False
    if kind == "game" and re.search(r"\bengine\b", description, re.I):
        return False  # "Godot" the game engine is a tool, not a game
    if kind == "listen" and artist and not artist & _tokens(description):
        return False
    # Another year in the description is another release: the 1979 "Deep End" is not the 1970 one.
    return not (year and re.search(r"\b\d{4}\b", description) and year not in description)


def _wiki_found(page, name):
    title = QUALIFIER.sub("", page.get("title", "")) or name
    # The right page without an image still gives the work's proper title.
    return {"title": title, "image_url": _https((page.get("thumbnail") or {}).get("source")),
            "source": "wikipedia", "found": True}


def _wiki_titles(name, person, kind, year):
    """The titles Wikipedia gives such a work, tried in one request, best first."""
    names = list(dict.fromkeys([name, string.capwords(name)]))
    suffixes = {"screen": ([f" ({year} film)"] if year else []) + ["", " (film)", " (TV series)", " (miniseries)"],
                "game": ["", " (video game)"],
                "listen": ([f" ({person} album)", f" ({person} song)"] if person else [])
                + [" (album)", " (song)", " (EP)", ""]}[kind]
    titles = list(dict.fromkeys(n + s for s in suffixes for n in names))
    result = _wiki_api({"titles": "|".join(titles), **WIKI_PROPS}, "title lookup")
    moved = {r["from"]: r["to"] for r in result.get("normalized", []) + result.get("redirects", [])}
    pages = {p.get("title"): p for p in result.get("pages", [])}
    artist = {w for w in _tokens(person) if len(w) >= 3}
    if kind == "listen" and not artist and len([w for w in _words(name) if w not in STOP]) < 2:
        return None
    for title in titles:
        seen = set()
        while title in moved and title not in seen:
            seen.add(title)
            title = moved[title]
        page = pages.get(title)
        if page and _wiki_fits(page, kind, artist, year):
            return _wiki_found(page, name)
    return None


def _wiki_page(query, name, person, kind, year):
    result = _wiki_api({"generator": "search", "gsrsearch": query, "gsrlimit": 8, **WIKI_PROPS}, "search")
    artist = {w for w in _tokens(person) if len(w) >= 3}
    if kind == "listen" and not artist and len([w for w in _words(name) if w not in STOP]) < 2:
        return None
    for page in sorted(result.get("pages", []), key=lambda p: p.get("index", 99)):
        if similarity(name, QUALIFIER.sub("", page.get("title", ""))) >= 0.8 and _wiki_fits(page, kind, artist, year):
            return _wiki_found(page, name)
    return None


META = re.compile(r'<meta\s+[^>]*?(?:property|name)\s*=\s*["\'](og:image|og:title|twitter:image|twitter:title)["\'][^>]*?>', re.I)
TITLE = re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S)
SEPARATORS = re.compile(r"\s+[|–—·-]\s+")


def clean_title(title, url):
    """A page's title minus the site name it usually ends with: "Moravec's paradox - Wikipedia",
    "Testosterone gave me my life back | Useful Fictions", "… - The New York Times"."""
    title = " ".join(html.unescape(title or "").split())
    parts = SEPARATORS.split(title)
    if len(parts) > 1:
        last = parts[-1]
        host = norm(host_of(url).split(".")[-2] if host_of(url).count(".") else host_of(url))
        if len(last) <= 40 and (host[:5] in norm(last) or norm(last) in host
                                or last.lower().startswith("by ") or len(last) * 2 < len(parts[0])):
            title = title[: title.rfind(last)].rstrip(" |–—·-")
    return title[:300] or None
CONTENT = re.compile(r'content\s*=\s*["\']([^"\']+)["\']', re.I)


def og(url):
    got = _get(url, gap=1.0, limit=600_000, accept="text/html")
    if not got or "html" not in got[1]:
        return {"title": None, "image_url": None, "source": "og", "found": False}
    page = got[0].decode("utf-8", "replace")
    tags = {}
    for m in META.finditer(page):
        c = CONTENT.search(m.group(0))
        if c:
            tags.setdefault(m.group(1).lower(), html.unescape(c.group(1)).strip())
    image = _https(tags.get("og:image") or tags.get("twitter:image"))
    if image and not _public_https(image):
        image = None
    raw = tags.get("og:title") or tags.get("twitter:title")
    if not raw:
        t = TITLE.search(page)
        raw = t.group(1) if t else None
    title = clean_title(raw, url)
    return {"title": title, "image_url": image, "source": "og", "found": bool(image or title)}


SOFTWARE = re.compile(r"software|application|\bapp\b|web ?site|online service|platform|programming|"
                      r"note-taking|editor|browser|language model|chatbot|operating system|framework", re.I)


def tool_icon(name):
    """Named tools rarely come with a link. Find the product on Wikidata (only entities whose
    description says they are software), take its official website (P856), use that site's icon."""
    q = urllib.parse.urlencode({"action": "wbsearchentities", "search": name, "language": "en",
                                "type": "item", "limit": 5, "format": "json"})
    hits = (_json(f"https://www.wikidata.org/w/api.php?{q}", gap=0.5) or {}).get("search", [])
    for hit in hits:
        if not SOFTWARE.search(hit.get("description") or "") or similarity(name, hit.get("label")) < 0.5:
            continue
        q = urllib.parse.urlencode({"action": "wbgetentities", "ids": hit["id"], "props": "claims",
                                    "format": "json"})
        entity = ((_json(f"https://www.wikidata.org/w/api.php?{q}", gap=0.5) or {})
                  .get("entities", {}).get(hit["id"], {}))
        for claim in entity.get("claims", {}).get("P856", []):
            site = claim.get("mainsnak", {}).get("datavalue", {}).get("value")
            if isinstance(site, str) and site.startswith("http"):
                return favicon(site)
    return {"title": None, "image_url": None, "source": "favicon", "found": False}


def favicon(url):
    host = host_of(url)
    if not re.fullmatch(r"[a-z0-9.-]+\.[a-z]{2,}", host):
        return {"title": None, "image_url": None, "source": "favicon", "found": False}
    return {"title": None, "image_url": f"https://icons.duckduckgo.com/ip3/{host}.ico",
            "source": "favicon", "found": True}
