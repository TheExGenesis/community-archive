"""Where the worker reads a member's own tweets from.

Production reads go through the ClickHouse analytics gateway (AGENTS.md: no corpus reads from
production Supabase). The gateway route `member-tweets` does not exist yet; its contract is
below and must ship in community-archive-control-panel before this source is used.
Local development reads a local ClickHouse loaded from the public export, as a read-only user.
"""
import base64
import json
import os
import re
import urllib.parse
import urllib.request

ID = re.compile(r"^[0-9]{1,20}$")


def _tweet(row):
    urls = [u for u in (row.get("urls") or []) if u]
    return {"tweet_id": row["tweet_id"], "created_at": row["created_at"],
            "text": row["full_text"] or "", "reply_to": row.get("reply_to_username"),
            "urls": urls, "short_urls": [u for u in (row.get("short_urls") or []) if u],
            "is_retweet": bool(row.get("is_retweet"))}


class LocalClickHouse:
    """Read-only SQL against a loopback ClickHouse (CLICKHOUSE_LOCAL_URL, _USER, _PASSWORD)."""

    def __init__(self):
        self.url = os.environ.get("CLICKHOUSE_LOCAL_URL", "http://127.0.0.1:8123")
        host = urllib.parse.urlparse(self.url).hostname
        if host not in ("127.0.0.1", "localhost", "::1"):
            raise SystemExit("CLICKHOUSE_LOCAL_URL must be a loopback address")
        user = os.environ.get("CLICKHOUSE_LOCAL_USER", "gateway_reader")
        password = os.environ.get("CLICKHOUSE_LOCAL_PASSWORD", "")
        self.auth = "Basic " + base64.b64encode(f"{user}:{password}".encode()).decode()

    def member_tweets(self, account_id):
        if not ID.match(account_id):
            raise ValueError("invalid account id")
        sql = f"""
            SELECT t.tweet_id, formatDateTime(t.created_at, '%Y-%m-%dT%H:%i:%SZ') AS created_at,
                   t.full_text, t.reply_to_username, t.is_retweet,
                   arrayFilter(x -> x != '', arrayMap(u -> ifNull(u.2, ''), e.urls)) AS urls,
                   arrayMap(u -> u.1, e.urls) AS short_urls
            FROM community_archive.tweets_serving t
            LEFT JOIN community_archive.export_tweets e ON e.tweet_id = t.tweet_id
            WHERE t.account_id = '{account_id}'
            ORDER BY t.tweet_id
            FORMAT JSONEachRow"""
        request = urllib.request.Request(self.url, data=sql.encode(), method="POST",
                                         headers={"Authorization": self.auth})
        with urllib.request.urlopen(request, timeout=60) as response:
            rows = [json.loads(line) for line in response.read().decode().splitlines() if line]
        return [_tweet(r) for r in rows]


class Gateway:
    """CLICKHOUSE_ANALYTICS_API_URL + Bearer CLICKHOUSE_API_TOKEN.

    Contract for the new route (to build in community-archive-control-panel):
      GET member-tweets?account_id=<id>&after=<tweet_id>&limit=<1..500>
      200 {"source": "clickhouse", "data": [{tweet_id, created_at, full_text,
           reply_to_username, is_retweet, urls: [expanded_url, ...], short_urls: [t.co url, ...]}],
           "next": <tweet_id|null>}
      Keyset by tweet_id ascending. Only accounts that are current members; the gateway
      returns 404 for anyone else so a stale caller cannot read a former member.
    """

    def __init__(self):
        self.base = os.environ["CLICKHOUSE_ANALYTICS_API_URL"].rstrip("/")
        self.token = os.environ["CLICKHOUSE_API_TOKEN"]

    def member_tweets(self, account_id):
        if not ID.match(account_id):
            raise ValueError("invalid account id")
        out, after = [], ""
        while True:
            query = urllib.parse.urlencode({"account_id": account_id, "after": after, "limit": 500})
            request = urllib.request.Request(f"{self.base}/member-tweets?{query}",
                                             headers={"Authorization": f"Bearer {self.token}"})
            with urllib.request.urlopen(request, timeout=60) as response:
                body = json.load(response)
            if body.get("source") != "clickhouse" or not isinstance(body.get("data"), list):
                raise RuntimeError("unexpected gateway response")
            out += [_tweet(r) for r in body["data"]]
            after = body.get("next")
            if not after:
                return out


SOURCES = {"local-clickhouse": LocalClickHouse, "gateway": Gateway}
