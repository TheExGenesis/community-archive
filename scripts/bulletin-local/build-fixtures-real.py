"""Real numbers for the local Bulletin preview, from the archive Parquet dump.

Called by build-fixtures.mjs (stdin JSON in, stdout JSON out); can also run alone:

  echo '{"me":"815615492429754369","notice_ids":["2074546385882419668"]}' \
    | uv run --with duckdb python3 scripts/bulletin-local/build-fixtures-real.py

Reads prototypes/offering-board/data/dump/{tweets,profiles}.parquet with filtered
DuckDB queries (never a full load) and returns:

  interactions  top 25 accounts the viewer replied to or quoted, by count
  engagement    favorite/retweet counts and created_at per notice tweet in the dump
  uptake        per notice: replies (distinct non-self repliers), quotes, ids
  threads       per notice: archived replies two levels deep, with profiles
  profiles      account_created_at / avatar for notice authors
"""
import json
import os
import sys
import duckdb

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DUMP = os.path.join(ROOT, "prototypes", "offering-board", "data", "dump")
TWEETS = os.path.join(DUMP, "tweets.parquet").replace("'", "''")
PROFILES = os.path.join(DUMP, "profiles.parquet").replace("'", "''")
THREAD_DEPTH = 2
THREAD_CAP = 40


# Timestamps are formatted in SQL (UTC, ISO 8601) so no timezone module is needed.
ISO = "strftime({}::timestamp, '%Y-%m-%dT%H:%M:%SZ')"


def media(items):
    return [
        {
            "mediaUrl": m.get("3"),
            "mediaType": m.get("2"),
            "width": m.get("4"),
            "height": m.get("5"),
        }
        for m in (items or [])
        if m.get("3")
    ]


def main():
    request = json.load(sys.stdin)
    me = request["me"]
    notice_ids = [str(i) for i in request["notice_ids"]]
    author_ids = [str(i) for i in request.get("author_ids", [])]
    con = duckdb.connect()
    con.execute("set TimeZone = 'UTC'")
    con.execute(f"create view tweets as select * from '{TWEETS}'")
    con.execute(f"create view profiles as select * from '{PROFILES}'")
    con.execute("create table ids as select unnest(?) as tweet_id", [notice_ids])
    con.execute(
        "create table notices as select * from tweets "
        "where tweet_id in (select tweet_id from ids) "
        "qualify row_number() over (partition by tweet_id order by latest_observed_at desc) = 1"
    )

    # 1. Outgoing interactions: the viewer's replies and quotes, by target account.
    # Quote targets resolve through the quoted tweet's author, so only quotes of
    # archived (member) tweets count, which matches what the archive can know.
    interactions = con.execute(
        """
        with mine as (
          select tweet_id, reply_to_account_id, quoted_tweet_id from tweets
          where account_id = ? and retweeted_tweet_id is null
        ),
        quoted as (
          select any_value(b.account_id) as target
          from mine m join tweets b on b.tweet_id = m.quoted_tweet_id
          where m.quoted_tweet_id is not null
          group by m.tweet_id
        ),
        targets as (
          select reply_to_account_id as target from mine where reply_to_account_id is not null
          union all select target from quoted
        )
        select target, count(*) as n from targets
        where target is not null and target <> ?
        group by target order by n desc, target limit 25
        """,
        [me, me],
    ).fetchall()

    # 2. Engagement and the archive's own timestamp for the notice tweets.
    engagement = {
        row[0]: {
            "favorite_count": int(row[1] or 0),
            "retweet_count": int(row[2] or 0),
            "created_at": row[3],
        }
        for row in con.execute(
            "select tweet_id, favorite_count, retweet_count, "
            f"{ISO.format('created_at')} from notices"
        ).fetchall()
    }

    # 3. Uptake: distinct repliers (self excluded) and quote tweets, plus the
    # prototype's own figure (distinct repliers including self) for comparison.
    uptake = {}
    for tid, all_ids, other_ids in con.execute(
        """
        select n.tweet_id,
               list(distinct r.account_id order by r.account_id),
               list(distinct r.account_id order by r.account_id)
                 filter (where r.account_id <> n.account_id)
        from notices n join tweets r on r.reply_to_tweet_id = n.tweet_id
        group by n.tweet_id
        """
    ).fetchall():
        uptake[tid] = {
            "replies": len(other_ids or []),
            "replies_including_self": len(all_ids or []),
            "reply_account_ids": list(other_ids or []),
            "quotes": 0,
        }
    for tid, n in con.execute(
        "select quoted_tweet_id, count(*) from tweets "
        "where quoted_tweet_id in (select tweet_id from ids) group by 1"
    ).fetchall():
        uptake.setdefault(
            tid, {"replies": 0, "replies_including_self": 0, "reply_account_ids": [], "quotes": 0}
        )["quotes"] = int(n)

    # 4. Threads: replies to each notice and replies to those, oldest first.
    con.execute(
        "create table thread as select n.tweet_id as root, r.* from notices n "
        "join tweets r on r.reply_to_tweet_id = n.tweet_id"
    )
    for _ in range(THREAD_DEPTH - 1):
        con.execute(
            "insert into thread select t.root, r.* from thread t "
            "join tweets r on r.reply_to_tweet_id = t.tweet_id "
            "where r.tweet_id not in (select tweet_id from thread)"
        )
    rows = con.execute(
        f"""
        select t.root, t.tweet_id, t.account_id, {ISO.format("t.created_at")}, t.full_text,
               t.reply_to_tweet_id, parent.username, t.favorite_count, t.retweet_count,
               p.username, p.display_name, p.avatar_media_url, t.media,
               t.quoted_tweet_id, t.retweeted_tweet_id
        from thread t
        left join profiles p on p.account_id = t.account_id
        left join profiles parent on parent.account_id = t.reply_to_account_id
        qualify row_number() over (partition by t.tweet_id order by t.latest_observed_at desc) = 1
        order by t.created_at, t.tweet_id
        """
    ).fetchall()
    threads = {}
    for row in rows:
        (root, tid, aid, created, text, parent_id, parent_user, favs, rts,
         user, name, avatar, items, quoted, retweeted) = row
        bucket = threads.setdefault(root, [])
        if len(bucket) >= THREAD_CAP:
            continue
        bucket.append(
            {
                "tweetId": tid,
                "accountId": aid,
                "createdAt": created,
                "fullText": text,
                "replyToTweetId": parent_id,
                "replyToUsername": parent_user,
                "favoriteCount": int(favs or 0),
                "retweetCount": int(rts or 0),
                "username": user,
                "accountDisplayName": name or user,
                "avatarMediaUrl": avatar,
                "media": media(items),
                "quoteTweetId": quoted,
                "quotedTweet": None,
                "retweetedTweetId": retweeted,
            }
        )

    # 5. Profile facts for notice authors (real account creation date, avatar).
    profiles = {
        row[0]: {
            "username": row[1],
            "display_name": row[2],
            "account_created_at": row[3],
            "avatar_media_url": row[4],
        }
        for row in con.execute(
            "select account_id, username, display_name, "
            f"{ISO.format('account_created_at')}, avatar_media_url "
            "from profiles where account_id in (select unnest(?))",
            [author_ids + [me]],
        ).fetchall()
    }

    json.dump(
        {
            "interactions": [
                {"accountId": target, "interactionCount": str(n)} for target, n in interactions
            ],
            "engagement": engagement,
            "uptake": uptake,
            "threads": threads,
            "profiles": profiles,
        },
        sys.stdout,
    )


if __name__ == "__main__":
    main()
