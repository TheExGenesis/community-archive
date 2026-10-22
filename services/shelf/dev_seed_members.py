# /// script
# requires-python = ">=3.11"
# dependencies = ["psycopg[binary]==3.2.9"]
# ///
"""LOCAL DEVELOPMENT ONLY. Make every member in the local ClickHouse export a member of a
local Supabase, so get_shelf's echoes (filtered through bulletin.allowed_accounts) and the
faces drawn next to works (user_directory) have someone to show.

The public export holds eligible members only; each becomes an opted-in account with its
profile. Refuses any database that is not on loopback.

  uv run dev_seed_members.py
"""
import os

import psycopg

from sources import LocalClickHouse

host = os.environ.get("POSTGRES_HOST", "127.0.0.1")
if host not in ("127.0.0.1", "localhost", "::1"):
    raise SystemExit("dev_seed_members.py only seeds a loopback database")
db = psycopg.connect(host=host, port=os.environ.get("POSTGRES_PORT", "54322"), user="postgres",
                     password=os.environ.get("POSTGRES_PASSWORD", "postgres"), dbname="postgres",
                     autocommit=True)
if db.execute("SELECT count(*) FROM public.archive_upload").fetchone()[0] > 100:
    raise SystemExit("this database has real uploads; dev_seed_members.py is for local databases only")

rows = LocalClickHouse()._rows("""
    SELECT account_id, argMax(username, latest_observed_at) AS username,
           argMax(display_name, latest_observed_at) AS name,
           argMax(formatDateTime(account_created_at, '%Y-%m-%dT%H:%i:%SZ'), latest_observed_at) AS created,
           argMax(avatar_media_url, latest_observed_at) AS avatar, argMax(bio, latest_observed_at) AS bio,
           argMax(num_tweets, latest_observed_at) AS tweets, argMax(num_followers, latest_observed_at) AS followers
    FROM community_archive.export_profiles GROUP BY account_id FORMAT JSONEachRow""")
added = 0
with db.transaction():
    for r in rows:
        if not r["account_id"].isdigit() or not r["username"]:
            continue
        cur = db.execute("""INSERT INTO public.all_account(account_id, created_via, username, created_at,
                              account_display_name, num_tweets, num_followers)
                            VALUES (%s, 'twitter_import', %s, coalesce(%s::timestamptz, now()), %s, %s, %s)
                            ON CONFLICT DO NOTHING""",
                         (r["account_id"], r["username"], r["created"], r["name"] or r["username"],
                          r["tweets"] or 0, r["followers"] or 0))
        added += cur.rowcount
        db.execute("""INSERT INTO public.all_profile(account_id, bio, avatar_media_url)
                      SELECT %s, %s, %s WHERE NOT EXISTS
                        (SELECT 1 FROM public.all_profile WHERE account_id = %s)""",
                   (r["account_id"], r["bio"], r["avatar"], r["account_id"]))
        db.execute("""INSERT INTO public.optin(username, twitter_user_id, opted_in, opted_in_at)
                      SELECT %s, %s, true, now() WHERE NOT EXISTS
                        (SELECT 1 FROM public.optin WHERE twitter_user_id = %s)""",
                   (r["username"], r["account_id"], r["account_id"]))
members = db.execute("SELECT count(*) FROM bulletin.allowed_accounts").fetchone()[0]
print(f"profiles {len(rows)}, accounts added {added}, current members {members}")
