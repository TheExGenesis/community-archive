"""Resolve t.co links the archive export did not expand.

The export records expanded URLs for most links, but not all: a tweet's text can carry
https://t.co/<code> with no matching entry. We ask t.co for the redirect target (one GET,
redirect not followed), cache it in shelf.short_links, and add real targets to the tweet's
URLs. Links that point back to a tweet or its photo are not works and are dropped.

t.co publishes no rate limits, so throttling is tracked: every status is counted, 429/503
back off (Retry-After honoured), and the stage stops after repeated throttling.
"""
import http.client
import json
import re
import time
from collections import Counter

from view import is_tweet_link

TCO = re.compile(r"https?://t\.co/([A-Za-z0-9]{4,20})")
USER_AGENT = "CommunityArchiveShelf/0.1 (+https://github.com/TheExGenesis/community-archive)"
THROTTLE_STATUSES = (429, 503)
MAX_CONSECUTIVE_THROTTLES = 5


def uncovered_codes(tweet):
    known = {m.group(1) for u in tweet.get("short_urls") or [] for m in [TCO.search(u)] if m}
    return [c for c in dict.fromkeys(TCO.findall(tweet["text"])) if c not in known]


def fetch(code):
    """One request to t.co. Returns (status, Location header or None, Retry-After or None)."""
    conn = http.client.HTTPSConnection("t.co", 443, timeout=10)
    try:
        conn.request("GET", f"/{code}", headers={"User-Agent": USER_AGENT})
        response = conn.getresponse()
        response.read(2048)
        return response.status, response.getheader("Location"), response.getheader("Retry-After")
    except (OSError, http.client.HTTPException):
        return 0, None, None
    finally:
        conn.close()


class Throttled(Exception):
    pass


def resolve_codes(codes, record, gap=0.25, log_every=100, fetch=fetch, sleep=time.sleep):
    """Resolve codes one at a time; record(code, status, target) persists each result.
    Returns a summary {"requests", "statuses", "throttled", "stopped"}."""
    statuses, throttled, consecutive, requests = Counter(), 0, 0, 0
    for i, code in enumerate(codes):
        for attempt in range(4):
            status, target, retry_after = fetch(code)
            requests += 1
            statuses[status] += 1
            if status not in THROTTLE_STATUSES:
                consecutive = 0
                break
            throttled += 1
            consecutive += 1
            if consecutive >= MAX_CONSECUTIVE_THROTTLES:
                summary = {"requests": requests, "statuses": dict(statuses), "throttled": throttled,
                           "stopped": f"{consecutive} throttles in a row at code {i + 1}/{len(codes)}"}
                print(json.dumps({"tco": summary}), flush=True)
                return summary
            sleep(min(float(retry_after) if retry_after and retry_after.isdigit() else 2 ** (attempt + 2), 120))
        if status and status not in THROTTLE_STATUSES:
            record(code, status, target if status in (301, 302, 303, 307, 308) else None)
        if (i + 1) % log_every == 0:
            print(json.dumps({"tco": {"done": i + 1, "of": len(codes), "statuses": dict(statuses),
                                      "throttled": throttled}}), flush=True)
        sleep(gap)
    summary = {"requests": requests, "statuses": dict(statuses), "throttled": throttled, "stopped": None}
    print(json.dumps({"tco": summary}), flush=True)
    return summary


def apply(tweets, targets):
    """Add resolved targets to tweets' URLs; mark tweets whose inputs changed (augmented)."""
    for t in tweets:
        added = [targets[c] for c in uncovered_codes(t)
                 if targets.get(c) and not is_tweet_link(targets[c]) and targets[c] not in t["urls"]]
        if added:
            t["urls"] = t["urls"] + added
            t["augmented"] = True
    return tweets
