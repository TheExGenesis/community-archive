# /// script
# requires-python = ">=3.11"
# dependencies = ["psycopg[binary]==3.2.9"]
# ///
"""Shelf worker: derive a member's shelf from their own tweets.

  gate    Jev: P(tweet refers to a specific work or tool)
  name    gpt-6-luna structured output: which works (gated tweets only)
  stance  Jev: engaged / warm / cold / pointing / made / is_work per mention
  derive  rebuild shelf.items from facts, then resolve titles and images

Facts (mentions, answers) are append-only, so reruns only pay for new tweets.

This phase runs for an explicit allowlist of two consenting accounts only. There is no
"all members" mode; any other account is refused. The database must be on loopback.

  uv run --env-file .env.local shelf_worker.py --accounts maskys_ GarrisonLovely
"""
import argparse
import datetime as dt
import hashlib
import json
import os
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

import images
import models
import shortlinks
import view
from sources import SOURCES

# Phase guard. Widening this list needs the product owner's explicit go-ahead.
PHASE_ALLOWLIST = {"815615492429754369": "maskys_", "370323535": "GarrisonLovely"}
GATE_THRESHOLD = 0.5
NAMER_ID = models.NAMER_MODEL + "/namer@1"
# Namer version for tweets re-read after t.co resolution added URLs.
NAMER_ID2 = models.NAMER_MODEL + "/namer@2"


def gate_question(t):
    return models.GATE2 if t.get("augmented") else models.GATE


def namer_id(t):
    return NAMER_ID2 if t.get("augmented") else NAMER_ID


def resolve_accounts(requested):
    if not requested:
        raise SystemExit("--accounts is required; this worker never runs over all members")
    by_name = {v.lower(): k for k, v in PHASE_ALLOWLIST.items()}
    out = []
    for a in requested:
        account_id = a if a in PHASE_ALLOWLIST else by_name.get(a.lower().lstrip("@"))
        if not account_id:
            raise SystemExit(f"refusing account {a!r}: not in this phase's allowlist")
        out.append(account_id)
    return list(dict.fromkeys(out))


def connect():
    host = os.environ.get("POSTGRES_HOST", "127.0.0.1")
    if host not in ("127.0.0.1", "localhost", "::1") and os.environ.get("SHELF_ALLOW_REMOTE_DB") != "1":
        raise SystemExit("refusing non-loopback POSTGRES_HOST in this phase")
    db = psycopg.connect(host=host, port=os.environ.get("POSTGRES_PORT", "54322"),
                         user=os.environ.get("POSTGRES_USER", "postgres"),
                         password=os.environ.get("POSTGRES_PASSWORD", "postgres"),
                         dbname=os.environ.get("POSTGRES_DB", "postgres"),
                         sslmode=os.environ.get("PGSSLMODE", "disable"), connect_timeout=10,
                         options="-c statement_timeout=60000 -c timezone=UTC",
                         autocommit=True, row_factory=dict_row)
    # Act with the grants the schema gives the worker (append-only facts), not as superuser.
    db.execute("SET ROLE service_role")
    return db


def is_member(db, account_id):
    return db.execute("SELECT 1 FROM bulletin.allowed_accounts WHERE account_id=%s",
                      (account_id,)).fetchone() is not None


class Ledger:
    """Run and day spending caps. Reservations are taken on worker threads (locked); every
    call, including failed ones, is recorded in shelf.calls from the main thread, and the
    difference between a reservation and the actual cost is returned to the budget."""

    def __init__(self, db, run_id, run_cap, day_cap):
        spent = db.execute("SELECT coalesce(sum(coalesce(actual_usd,reserved_usd)),0) AS s FROM shelf.calls "
                           "WHERE created_at >= date_trunc('day', now())").fetchone()["s"]
        self.db, self.run_id = db, run_id
        self.left = min(Decimal(str(run_cap)), Decimal(str(day_cap)) - Decimal(spent))
        self.lock = threading.Lock()

    def reserve(self, usd):
        usd = Decimal(str(usd))
        with self.lock:
            if usd > self.left:
                return False
            self.left -= usd
            return True

    def settle(self, provider, model, stage, reserved, actual, status):
        """Record a call. A failed call keeps its whole reservation, since it may be billed."""
        if actual is not None:
            with self.lock:
                self.left += Decimal(str(reserved)) - Decimal(str(actual))
        self.db.execute("INSERT INTO shelf.calls(run_id,provider,model,stage,reserved_usd,actual_usd,status) "
                        "VALUES (%s,%s,%s,%s,%s,%s,%s)",
                        (self.run_id, provider, model, stage, Decimal(str(round(reserved, 8))),
                         None if actual is None else Decimal(str(round(actual, 8))), status))


class OutOfBudget(Exception):
    pass


class Stopped(Exception):
    pass


MAX_CONSECUTIVE_FAILURES = 20


def paid_stage(ledger, todo, estimate, ask, persist, provider, model, stage, workers, counts):
    """Run paid calls on worker threads and persist results on this (the main) thread.

    After the budget runs out, remaining items fail fast without spending, while calls already
    in flight still finish; their results are recorded and kept, not dropped."""
    stop = threading.Event()

    def run(item):
        if stop.is_set():
            return item, 0, Stopped(), None
        est = estimate(item)
        if not ledger.reserve(est):
            return item, est, OutOfBudget(), None
        try:
            return item, est, None, models.with_retries(lambda: ask(item))
        except Exception as e:  # noqa: BLE001 - recorded per call; fatal ones stop the stage
            if isinstance(e, models.FatalModelError):
                stop.set()
            return item, est, e, None

    failures = 0
    with ThreadPoolExecutor(workers) as pool:
        for item, est, err, result in pool.map(run, todo):
            if isinstance(err, Stopped):
                continue
            if isinstance(err, OutOfBudget):
                counts["budget_stop"] = True
                continue
            if err is not None:
                billed = getattr(err, "billed", True)
                ledger.settle(provider, model, stage, est, None if billed else 0,
                              f"failed:{type(err).__name__}:{err}"[:60])
                counts[f"{stage}_errors"] = counts.get(f"{stage}_errors", 0) + 1
                failures += 1
                if isinstance(err, models.FatalModelError) or failures >= MAX_CONSECUTIVE_FAILURES:
                    stop.set()
                    counts["stopped"] = f"{stage}: {err}"
                continue
            failures = 0
            out, ms, usd = result
            ledger.settle(provider, model, stage, est, usd, "ok")
            persist(item, out, ms, usd)


def gate(db, ledger, account_id, tweets, classifier, workers, counts):
    call, env, provider, model = models.CLASSIFIERS[classifier]
    key = os.environ.get(env) or sys.exit(f"{env} is not set")
    done = {(r["subject"], r["question"]) for r in db.execute(
        "SELECT subject, question FROM shelf.answers WHERE account_id=%s AND question IN (%s,%s) AND model=%s",
        (account_id, models.GATE[0], models.GATE2[0], model))}
    todo = [t for t in tweets if (f"tweet:{t['tweet_id']}", gate_question(t)[0]) not in done]

    def persist(t, answers, ms, usd):
        q = gate_question(t)[0]
        a = answers[q]
        db.execute("INSERT INTO shelf.answers(subject,question,model,account_id,p,refusal,cost_usd,latency_ms) "
                   "VALUES (%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                   (f"tweet:{t['tweet_id']}", q, model, account_id, a.get("p"),
                    bool(a.get("refusal")), usd, ms))
        counts["gated"] = counts.get("gated", 0) + 1

    paid_stage(ledger, todo,
               lambda t: models.estimate_classifier_usd(classifier, models.tweet_state(t), [gate_question(t)]),
               lambda t: call(models.tweet_state(t), [gate_question(t)], key),
               persist, provider, model, "gate", workers, counts)


def mention_id(tweet_id, surface):
    return "mention:" + hashlib.sha1(f"{tweet_id}|{surface}".encode()).hexdigest()[:12]


def name(db, ledger, account_id, tweets, classifier, workers, counts):
    key = os.environ.get("OPENAI_API_KEY") or sys.exit("OPENAI_API_KEY is not set")
    gate_model = models.CLASSIFIERS[classifier][3]
    passed = {(r["subject"][6:], r["question"]) for r in db.execute(
        "SELECT subject, question FROM shelf.answers WHERE account_id=%s AND question IN (%s,%s) AND model=%s AND p>=%s",
        (account_id, models.GATE[0], models.GATE2[0], gate_model, GATE_THRESHOLD))}
    done = {(r["tweet_id"], r["namer"]) for r in db.execute(
        "SELECT tweet_id, namer FROM shelf.named_tweets WHERE account_id=%s", (account_id,))}
    todo = [t for t in tweets if (t["tweet_id"], gate_question(t)[0]) in passed
            and (t["tweet_id"], namer_id(t)) not in done]

    def persist(t, mentions, ms, usd):
        # verbatim is checked in code: a generative step can garble the evidence it cites.
        haystack = (t["text"] + " " + " ".join(t["urls"])).lower()
        with db.transaction():
            for m in mentions:
                surface = m["surface"].strip()[:2000]
                if not surface:
                    continue
                db.execute("INSERT INTO shelf.mentions(id,account_id,tweet_id,surface,identity,name,creator,kind,namer,verbatim) "
                           "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                           (mention_id(t["tweet_id"], surface), account_id, t["tweet_id"], surface,
                            m["identity"], m["name"][:500] or surface[:500],
                            (m["creator"] or None) and m["creator"][:300],
                            m["kind"][:100] or "unknown", namer_id(t), surface.lower() in haystack))
            db.execute("INSERT INTO shelf.named_tweets(tweet_id,namer,account_id,mention_count,cost_usd) "
                       "VALUES (%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                       (t["tweet_id"], namer_id(t), account_id, len(mentions), usd))
        counts["named"] = counts.get("named", 0) + 1

    paid_stage(ledger, todo, models.estimate_namer_usd, lambda t: models.name_mentions(t, key),
               persist, "openai", models.NAMER_MODEL, "name", workers, counts)


def stance(db, ledger, account_id, tweets, classifier, workers, counts):
    call, env, provider, model = models.CLASSIFIERS[classifier]
    key = os.environ.get(env) or sys.exit(f"{env} is not set")
    by_id = {t["tweet_id"]: t for t in tweets}
    rows = db.execute("""SELECT m.* FROM shelf.mentions m WHERE m.account_id=%s AND m.verbatim
                         AND NOT EXISTS (SELECT 1 FROM shelf.answers a WHERE a.subject=m.id
                           AND a.question='engaged@1' AND a.model=%s)""", (account_id, model)).fetchall()
    todo = [m for m in rows if m["tweet_id"] in by_id]
    questions = models.stance_questions()

    def persist(m, answers, ms, usd):
        with db.transaction():
            for q, a in answers.items():
                db.execute("INSERT INTO shelf.answers(subject,question,model,account_id,p,refusal,cost_usd,latency_ms) "
                           "VALUES (%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                           (m["id"], q, model, account_id, a.get("p"), bool(a.get("refusal")),
                            usd / len(answers), ms))
        counts["stanced"] = counts.get("stanced", 0) + 1

    def state(m):
        return models.mention_state(by_id[m["tweet_id"]], m)

    paid_stage(ledger, todo, lambda m: models.estimate_classifier_usd(classifier, state(m), questions),
               lambda m: call(state(m), questions, key), persist, provider, model, "stance",
               workers, counts)


def content_hash(item):
    """What the public sees about an item; approvals are tied to it (shelf.curation.approved_hash).
    New evidence alone does not reopen review; a new label, row, creator, link or mark does."""
    public = [item["shelf_row"], item["label"][:500], item["creator"], item["url"], sorted(item["marks"])]
    return hashlib.sha256(json.dumps(public, ensure_ascii=False).encode()).hexdigest()


def links(db, account_id, tweets, counts, network=True):
    """Resolve t.co codes the export did not expand (network=False uses the cache only)."""
    codes = list(dict.fromkeys(c for t in tweets for c in shortlinks.uncovered_codes(t)))
    cached = {r["code"]: r["target"] for r in db.execute(
        "SELECT code, target FROM shelf.short_links WHERE code = ANY(%s)", (codes,))}
    todo = [c for c in codes if c not in cached]
    counts["tco_codes"], counts["tco_cached"] = len(codes), len(cached)
    if network and todo:
        def record(code, status, target):
            db.execute("INSERT INTO shelf.short_links(code,target,status) VALUES (%s,%s,%s) "
                       "ON CONFLICT (code) DO UPDATE SET target=EXCLUDED.target, status=EXCLUDED.status, resolved_at=now()",
                       (code, target, status))
            cached[code] = target
        summary = shortlinks.resolve_codes(todo, record)
        counts["tco"] = summary
        if summary["stopped"]:
            counts["stopped"] = "links: " + summary["stopped"]
    shortlinks.apply(tweets, cached)
    counts["tweets_with_new_links"] = sum(1 for t in tweets if t.get("augmented"))


def short_key(key):
    return key if len(key) <= 300 else key[:250] + "#" + hashlib.sha1(key.encode()).hexdigest()[:16]


def derive(db, account_id, tweets, classifier, counts, resolve_images=True):
    if not is_member(db, account_id):  # consent can change during a run
        db.execute("DELETE FROM shelf.items WHERE account_id=%s", (account_id,))
        counts["skipped_not_member"] = True
        return
    model = models.CLASSIFIERS[classifier][3]
    tweet_map = {t["tweet_id"]: t for t in tweets}
    mentions = db.execute("SELECT * FROM shelf.mentions WHERE account_id=%s", (account_id,)).fetchall()
    renamed = {r["tweet_id"] for r in db.execute(
        "SELECT tweet_id FROM shelf.named_tweets WHERE account_id=%s AND namer=%s", (account_id, NAMER_ID2))}
    # A tweet re-read with resolved links supersedes its first reading.
    mentions = [m for m in mentions if m["namer"] == (NAMER_ID2 if m["tweet_id"] in renamed else NAMER_ID)]
    answers = {}
    for r in db.execute("SELECT subject, question, p FROM shelf.answers WHERE account_id=%s AND model=%s "
                        "AND subject LIKE 'mention:%%' AND p IS NOT NULL", (account_id, model)):
        answers.setdefault(r["subject"], {})[r["question"].split("@")[0]] = r["p"]
    items = view.build(tweet_map, mentions, answers)
    for item in items:
        item["work_key"] = short_key(item["work_key"])
        item["image_url"] = item["image_source"] = None
        if resolve_images and item["shelf_row"] not in ("mentioned",):
            apply_image(db, item, counts)
    items = view.merge_same_titles(items)
    if not is_member(db, account_id):  # consent can change during a run
        db.execute("DELETE FROM shelf.items WHERE account_id=%s", (account_id,))
        counts["skipped_not_member"] = True
        return
    with db.transaction():
        db.execute("DELETE FROM shelf.items WHERE account_id=%s", (account_id,))
        for i in items:
            db.execute("""INSERT INTO shelf.items(account_id,work_key,shelf_row,medium,label,needs_title,creator,url,
                          marks,evidence_tweet_ids,first_at,last_at,image_url,image_source,content_hash)
                          VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                       (account_id, i["work_key"], i["shelf_row"], i["medium"], i["label"][:500],
                        i["needs_title"], i["creator"], i["url"], i["marks"], i["evidence_tweet_ids"],
                        i["first_at"], i["last_at"], i["image_url"], i["image_source"], content_hash(i)))
    counts["items"] = len(items)


def apply_image(db, item, counts):
    key = images.resolution_key(item)
    if not key:
        return
    row = db.execute("SELECT * FROM shelf.resolutions WHERE key=%s", (key,)).fetchone()
    if row is None:
        found = images.resolve(key, item)
        db.execute("INSERT INTO shelf.resolutions(key,title,image_url,source,found) VALUES (%s,%s,%s,%s,%s) "
                   "ON CONFLICT (key) DO NOTHING",
                   (key, (found["title"] or None) and found["title"][:500], found["image_url"],
                    found["source"], found["found"]))
        row = found
        counts["resolved"] = counts.get("resolved", 0) + 1
    if row["image_url"]:
        item["image_url"], item["image_source"] = row["image_url"], row["source"]
    title = (row.get("title") or "").strip()
    if item.get("url") and row.get("source") == "og" and title:
        # For a link, the page's own title is authoritative; the namer's label (often the URL
        # slug in words) is only the fallback when the page could not be fetched.
        title = images.clean_title(title, item["url"])
        item["label"], item["needs_title"] = title, False
    elif title and (item["needs_title"] or better_title(item["label"], title)):
        item["label"], item["needs_title"] = title[:300], False


def better_title(label, title):
    """Prefer the source's own title when ours is a lowercased copy of the same name, e.g. a
    tweet's "catch 22" or a URL slug, and the two clearly name the same work."""
    for suffix in (" - Wikipedia", " | Substack"):
        title = title.removesuffix(suffix)
    return label == label.lower() and images.similarity(label, title) >= 0.6


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--accounts", nargs="+", required=True, help="usernames or ids (allowlisted)")
    ap.add_argument("--stages", nargs="+", default=["links", "gate", "name", "stance", "derive"],
                    choices=["links", "gate", "name", "stance", "derive"])
    ap.add_argument("--source", choices=sorted(SOURCES), default="local-clickhouse")
    ap.add_argument("--classifier", choices=sorted(models.CLASSIFIERS), default="jev")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--max-usd", type=float, default=2.0, help="cap for this run")
    ap.add_argument("--day-usd", type=float, default=5.0, help="cap across runs today")
    ap.add_argument("--no-images", action="store_true")
    ap.add_argument("--limit", type=int, help="process only the newest N tweets (smoke tests)")
    a = ap.parse_args(argv)
    accounts = resolve_accounts(a.accounts)
    db = connect()
    source = SOURCES[a.source]()
    run_id = db.execute("INSERT INTO shelf.runs(accounts) VALUES (%s) RETURNING id", (accounts,)).fetchone()["id"]
    ledger = Ledger(db, run_id, a.max_usd, a.day_usd)
    report, status = {}, "done"
    try:
        for account_id in accounts:
            counts = report.setdefault(PHASE_ALLOWLIST[account_id], {})
            if not is_member(db, account_id):
                db.execute("DELETE FROM shelf.items WHERE account_id=%s", (account_id,))
                counts["skipped_not_member"] = True
                continue
            tweets = [t for t in source.member_tweets(account_id) if not t["is_retweet"]
                      and not t["text"].startswith("RT @")]
            if a.limit:
                tweets = sorted(tweets, key=lambda t: t["tweet_id"])[-a.limit:]
            counts["tweets"] = len(tweets)
            if "links" not in a.stages:
                links(db, account_id, tweets, counts, network=False)
            for stage in a.stages:
                if not is_member(db, account_id):
                    db.execute("DELETE FROM shelf.items WHERE account_id=%s", (account_id,))
                    counts["skipped_not_member"] = True
                    break
                if stage == "links":
                    links(db, account_id, tweets, counts)
                elif stage == "derive":
                    derive(db, account_id, tweets, a.classifier, counts, not a.no_images)
                else:
                    {"gate": gate, "name": name, "stance": stance}[stage](
                        db, ledger, account_id, tweets, a.classifier, a.workers, counts)
                print(json.dumps({"account": PHASE_ALLOWLIST[account_id], "stage": stage, **counts}),
                      flush=True)
                if counts.get("budget_stop") or counts.get("stopped"):
                    status = "budget" if counts.get("budget_stop") else "failed"
                    break
    except BaseException:
        status = "failed"
        raise
    finally:
        db.execute("UPDATE shelf.runs SET finished_at=now(), status=%s, counts=%s WHERE id=%s",
                   (status, Jsonb(report), run_id))
        spent = db.execute("SELECT coalesce(sum(actual_usd),0) AS s FROM shelf.calls WHERE run_id=%s",
                           (run_id,)).fetchone()["s"]
        print(json.dumps({"run": run_id, "status": status, "spent_usd": float(spent),
                          "at": dt.datetime.now(dt.timezone.utc).isoformat()}), flush=True)


if __name__ == "__main__":
    main()
