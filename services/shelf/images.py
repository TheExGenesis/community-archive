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
import time
import urllib.parse

from view import host_of, norm, youtube_id

USER_AGENT = "CommunityArchiveShelf/0.1 (+https://github.com/TheExGenesis/community-archive)"
_last_call = {}


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


def _get(url, gap=1.0, limit=1_500_000, accept="application/json", hops=3):
    """GET a public https URL. Every redirect hop is validated and pinned the same way.
    Plain http links are tried over https. Any failure returns None."""
    if url.startswith("http://"):
        url = "https://" + url[7:]
    for _ in range(hops + 1):
        p = urllib.parse.urlparse(url)
        if p.scheme != "https" or not p.hostname or p.port not in (None, 443):
            return None
        ip = _global_ip(p.hostname)
        if ip is None:
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
                return None
            return response.read(limit), response.getheader("Content-Type", "")
        except (OSError, http.client.HTTPException, ssl.SSLError, ValueError):
            return None
        finally:
            conn.close()
    return None


def _json(url, gap=1.0):
    got = _get(url, gap)
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
                     + urllib.parse.quote(f"https://www.youtube.com/watch?v={rest}"), gap=0.3)
        if not meta:
            return {"title": None, "image_url": None, "source": "youtube", "found": False}
        return {"title": meta.get("title"), "image_url": f"https://i.ytimg.com/vi/{rest}/hqdefault.jpg",
                "source": "youtube", "found": True}
    if kind == "spotify":
        target = (item.get("url") or rest).split("?")[0]
        meta = _json("https://open.spotify.com/oembed?url=" + urllib.parse.quote(target), gap=0.5)
        return {"title": (meta or {}).get("title"), "image_url": _https((meta or {}).get("thumbnail_url")),
                "source": "spotify", "found": bool(meta)}
    if kind == "book":
        return openlibrary(item["name"], item.get("creator"))
    if kind == "tool":
        return tool_icon(item["name"])
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


def _tokens(text):
    return set(re.findall(r"[a-z0-9]+", re.sub(r"['’]", "", (text or "").lower()))) - STOP


def similarity(a, b):
    ta, tb = _tokens(a), _tokens(b)
    return len(ta & tb) / len(ta | tb) if ta and tb else 0.0


def openlibrary(title, creator):
    """Title (+ author) search; keep a result only if the title matches and the cover exists.
    Prefers an English edition because title search can return a translation's cover."""
    q = urllib.parse.urlencode({"q": f"{title} {creator or ''}".strip(), "limit": 5,
                                "fields": "key,title,author_name,cover_i,language"})
    data = _json(f"https://openlibrary.org/search.json?{q}", gap=1.0)
    def author_match(d):
        return bool(creator) and any(similarity(creator, a) for a in d.get("author_name") or [])

    # A stated creator must match, unless the title match is near-exact: creators taken from
    # tweets are often handles ("sapinker") that no catalogue knows.
    docs = [d for d in (data or {}).get("docs", []) if d.get("cover_i")
            and (similarity(title, d.get("title")) >= 0.8
                 or (similarity(title, d.get("title")) >= 0.6 and (not creator or author_match(d))))]
    docs.sort(key=lambda d: (not author_match(d), "eng" not in (d.get("language") or [])))
    if not docs:
        return {"title": None, "image_url": None, "source": "openlibrary", "found": False}
    return {"title": docs[0].get("title"), "image_url": f"https://covers.openlibrary.org/b/id/{docs[0]['cover_i']}-M.jpg",
            "source": "openlibrary", "found": True}


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
