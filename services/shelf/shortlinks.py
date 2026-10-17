"""Resolve t.co links the archive export did not expand.

The export records expanded URLs for most links, but not all: a tweet's text can carry
https://t.co/<code> with no matching entry. We ask t.co for the redirect target (one GET,
redirect not followed), cache it in shelf.short_links, and add real targets to the tweet's
URLs. Links that point back to a tweet or its photo are not works and are dropped.

t.co publishes no rate limits, so throttling is tracked: every status is counted, 429/503
back off (Retry-After honoured), and the stage stops after repeated throttling. A sequential
run of 1,300 requests saw no throttling, so lookups run 8 at a time.
"""
import http.client
import json
import re
import threading
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

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


def resolve_codes(codes, record, workers=8, log_every=100, fetch=fetch, sleep=time.sleep):
    """Resolve codes on worker threads; record(code, status, target) runs on this thread.
    Throttling is counted across all threads: 429/503 back off (Retry-After honoured) and
    MAX_CONSECUTIVE_THROTTLES in a row stops the run. Returns a summary."""
    lock, stop = threading.Lock(), threading.Event()
    state = {"consecutive": 0, "throttled": 0}

    def one(code):
        seen = []
        for attempt in range(4):
            if stop.is_set():
                return code, None, None, seen
            status, target, retry_after = fetch(code)
            seen.append(status)
            if status not in THROTTLE_STATUSES:
                with lock:
                    state["consecutive"] = 0
                return code, status, target, seen
            with lock:
                state["throttled"] += 1
                state["consecutive"] += 1
                if state["consecutive"] >= MAX_CONSECUTIVE_THROTTLES:
                    stop.set()
                    return code, None, None, seen
            sleep(min(float(retry_after) if retry_after and retry_after.isdigit() else 2 ** (attempt + 2), 120))
        return code, None, None, seen

    statuses, done = Counter(), 0
    with ThreadPoolExecutor(workers) as pool:
        for code, status, target, seen in pool.map(one, codes):
            statuses.update(seen)
            done += 1
            if status and status not in THROTTLE_STATUSES:
                record(code, status, target if status in (301, 302, 303, 307, 308) else None)
            if done % log_every == 0:
                print(json.dumps({"tco": {"done": done, "of": len(codes), "statuses": dict(statuses),
                                          "throttled": state["throttled"]}}), flush=True)
    summary = {"requests": sum(statuses.values()), "statuses": dict(statuses),
               "throttled": state["throttled"],
               "stopped": f"{MAX_CONSECUTIVE_THROTTLES} throttles in a row" if stop.is_set() else None}
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
