"""Unit tests that need no database or network.

  cd services/shelf && uv run --with 'psycopg[binary]==3.2.9' python -m unittest test_shelf -v
"""
import os
import unittest
from unittest import mock

import images
import shelf_worker
import view


def mention(mid, tweet_id, surface, name, kind="book", identity="named", creator=None):
    return {"id": mid, "tweet_id": tweet_id, "surface": surface, "name": name, "kind": kind,
            "identity": identity, "creator": creator, "verbatim": True}


TWEETS = {
    "1": {"created_at": "2024-01-01T00:00:00Z", "urls": []},
    "2": {"created_at": "2025-01-01T00:00:00Z", "urls": ["https://youtu.be/abcDEF12345"]},
    "3": {"created_at": "2025-06-01T00:00:00Z", "urls": ["https://en.wikipedia.org/wiki/Moravec%27s_paradox"]},
}


class Guards(unittest.TestCase):
    def test_accounts_required(self):
        with self.assertRaises(SystemExit):
            shelf_worker.resolve_accounts([])

    def test_refuses_accounts_outside_allowlist(self):
        with self.assertRaises(SystemExit):
            shelf_worker.resolve_accounts(["maskys_", "visakanv"])

    def test_resolves_usernames_and_ids(self):
        self.assertEqual(shelf_worker.resolve_accounts(["@MASKYS_", "370323535", "maskys_"]),
                         ["815615492429754369", "370323535"])

    def test_refuses_remote_database(self):
        with mock.patch.dict(os.environ, {"POSTGRES_HOST": "db.example.supabase.co"}, clear=False):
            os.environ.pop("SHELF_ALLOW_REMOTE_DB", None)
            with self.assertRaises(SystemExit):
                shelf_worker.connect()


class View(unittest.TestCase):
    def test_each_work_once_with_marks(self):
        ms = [mention("mention:000000000001", "1", "Out of Control", "Out of Control", creator="Kevin Kelly"),
              mention("mention:000000000002", "2", "Out of Control", "Out of Control")]
        answers = {"mention:000000000001": {"engaged": .9, "warm": .95, "pointing": .2, "cold": .1, "made": .0},
                   "mention:000000000002": {"engaged": .4, "warm": .1, "pointing": .9, "cold": .1, "made": .0}}
        items = [i for i in view.build(TWEETS, ms, answers) if i["shelf_row"] != "links"]
        self.assertEqual(len(items), 1)
        item = items[0]
        self.assertEqual(item["shelf_row"], "books")
        self.assertEqual(item["marks"], ["loved", "recommended"])
        self.assertEqual(item["evidence_tweet_ids"], ["2", "1"])
        self.assertEqual(item["creator"], "Kevin Kelly")

    def test_made_and_mentioned_rows(self):
        ms = [mention("mention:000000000003", "1", "my book", "(unnamed book)", identity="unnamed"),
              mention("mention:000000000004", "2", "o1", "o1", kind="AI model")]
        answers = {"mention:000000000003": {"made": .9, "engaged": .9},
                   "mention:000000000004": {"made": 0, "engaged": .1, "warm": .2, "cold": .1, "pointing": .1}}
        rows = {i["work_key"]: i for i in view.build(TWEETS, ms, answers)}
        self.assertEqual(rows["unnamed:unnamedbook"]["shelf_row"], "made")
        self.assertEqual(rows["unnamed:unnamedbook"]["label"], "Untitled book")
        self.assertTrue(rows["unnamed:unnamedbook"]["needs_title"])
        self.assertEqual(rows["name:o1"]["shelf_row"], "mentioned")

    def test_unverified_surfaces_are_dropped(self):
        m = mention("mention:000000000005", "2", "https://youtu.be/abcDEF1234X", "abcDEF1234X",
                    kind="youtube video", identity="url")
        m["verbatim"] = False
        items = view.build(TWEETS, [m], {m["id"]: {"engaged": .9}})
        self.assertEqual([i["shelf_row"] for i in items], ["links"])

    def test_quality_rules(self):
        ms = [mention("mention:00000000000a", "1", "@RoamResearch", "RoamResearch", kind="software"),
              mention("mention:00000000000b", "2", "Roam Research", "Roam Research", kind="app"),
              mention("mention:00000000000c", "1", "@comm_archive", "@comm_archive", kind="account"),
              mention("mention:00000000000d", "2", "https://nitter.net/x/status/1", "nitter", kind="article",
                      identity="url")]
        ms[3]["surface"] = "https://nitter.net/x/status/1"
        tweets = {"1": TWEETS["1"], "2": {"created_at": "2025-01-01T00:00:00Z", "urls": ["https://nitter.net/x/status/1"]}}
        answers = {"mention:00000000000a": {"is_work": .9, "engaged": .9, "made": .9},
                   "mention:00000000000b": {"is_work": .9, "engaged": .9, "made": .1},
                   "mention:00000000000c": {"is_work": .1, "engaged": .9},
                   "mention:00000000000d": {"is_work": .9, "engaged": .9}}
        items = view.build(tweets, ms, answers)
        self.assertEqual([(i["label"], i["shelf_row"]) for i in items], [("Roam Research", "tools")])
        self.assertEqual(items[0]["evidence_tweet_ids"], ["2", "1"])

    def test_merge_same_titles(self):
        a = {"work_key": "name:outofcontrol", "shelf_row": "books", "label": "Out of Control", "needs_title": False,
             "evidence_tweet_ids": ["1"], "first_at": "2024", "last_at": "2024", "marks": ["loved"],
             "creator": "Kevin Kelly", "image_url": None, "image_source": None}
        b = a | {"work_key": "url:amazon.com/x", "evidence_tweet_ids": ["2"], "last_at": "2025",
                 "marks": ["recommended"], "creator": None, "image_url": "https://x/y.jpg", "image_source": "og"}
        merged = view.merge_same_titles([a, b])
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]["marks"], ["loved", "recommended"])
        self.assertEqual(merged[0]["image_url"], "https://x/y.jpg")
        self.assertEqual(merged[0]["evidence_tweet_ids"], ["1", "2"])

    def test_named_video_gets_its_link(self):
        tweets = {"9": {"created_at": "2023-07-01T00:00:00Z", "urls": ["https://www.youtube.com/watch?v=ZfytHvgHybA"]}}
        m = mention("mention:00000000000e", "9", "Stop Drawing Dead Fish", "Stop Drawing Dead Fish", kind="talk video")
        items = view.build(tweets, [m], {m["id"]: {"is_work": .9, "engaged": .9}})
        self.assertEqual(items[0]["url"], "https://www.youtube.com/watch?v=ZfytHvgHybA")
        self.assertEqual(items[0]["label"], "Stop Drawing Dead Fish")

    def test_youtube_id_is_not_a_title(self):
        self.assertEqual(view.display_name("abcDEF12345", "https://youtu.be/abcDEF12345"),
                         ("YouTube video", True))
        self.assertEqual(view.display_name("Aging Gracefully", "https://youtu.be/abcDEF12345"),
                         ("Aging Gracefully", False))

    def test_medium(self):
        self.assertEqual(view.medium("YouTube video"), "watching")
        self.assertEqual(view.medium("GPT-5 series"), "watching")  # documented limitation
        self.assertEqual(view.medium("AI models"), "tools")
        self.assertEqual(view.medium("video essay"), "watching")
        self.assertEqual(view.medium("podcast episode"), "listening")
        self.assertEqual(view.medium("xyz"), "other")

    def test_wikipedia_links_row(self):
        links = view.wikipedia_links(TWEETS)
        self.assertEqual(links[0]["label"], "Moravec's paradox")
        self.assertEqual(links[0]["shelf_row"], "links")


class Titles(unittest.TestCase):
    def test_source_title_replaces_lowercase_copy(self):
        self.assertTrue(shelf_worker.better_title("catch 22", "Catch-22"))
        self.assertTrue(shelf_worker.better_title("cats cradle", "Cat's Cradle"))
        self.assertFalse(shelf_worker.better_title("Wicked Problems", "Wicked Problems | Norton"))
        self.assertFalse(shelf_worker.better_title("grok", "Elon Musk on X"))


class Budget(unittest.TestCase):
    def test_in_flight_results_survive_a_budget_stop(self):
        db = mock.MagicMock()
        db.execute.return_value.fetchone.return_value = {"s": 0}
        ledger = shelf_worker.Ledger(db, 1, run_cap=0.25, day_cap=10)
        saved, counts = [], {}
        shelf_worker.models.with_retries = lambda fn, tries=4: fn()
        shelf_worker.paid_stage(ledger, list(range(5)), lambda i: 0.1, lambda i: ("ok", 5, 0.1),
                                lambda i, out, ms, usd: saved.append(i), "typesafe", "jev", "gate", 1, counts)
        self.assertEqual(saved, [0, 1])
        self.assertTrue(counts["budget_stop"])

    def test_fatal_error_stops_the_stage(self):
        db = mock.MagicMock()
        db.execute.return_value.fetchone.return_value = {"s": 0}
        ledger = shelf_worker.Ledger(db, 1, run_cap=1, day_cap=10)
        calls, counts = [], {}

        def ask(i):
            calls.append(i)
            raise shelf_worker.models.FatalModelError("HTTP 429", billed=False)
        shelf_worker.models.with_retries = lambda fn, tries=4: fn()
        shelf_worker.paid_stage(ledger, list(range(50)), lambda i: 0.01, ask,
                                lambda *a: None, "openai", "luna", "name", 1, counts)
        self.assertLessEqual(len(calls), 2)
        self.assertIn("name", counts["stopped"])
        self.assertTrue(ledger.reserve(0.99))  # unbilled failures were refunded

    def test_refunds_estimate_minus_actual(self):
        db = mock.MagicMock()
        db.execute.return_value.fetchone.return_value = {"s": 0}
        ledger = shelf_worker.Ledger(db, 1, run_cap=0.25, day_cap=10)
        self.assertTrue(ledger.reserve(0.2))
        self.assertFalse(ledger.reserve(0.1))
        ledger.settle("typesafe", "jev", "gate", 0.2, 0.01, "ok")
        self.assertTrue(ledger.reserve(0.2))
        ledger.settle("typesafe", "jev", "gate", 0.04, None, "failed:HTTPError")  # failed keeps reservation
        self.assertFalse(ledger.reserve(0.1))

    def test_content_hash_ignores_new_evidence(self):
        item = {"shelf_row": "books", "label": "Catch-22", "creator": None, "url": None,
                "marks": ["loved"], "evidence_tweet_ids": ["1"]}
        same = item | {"evidence_tweet_ids": ["1", "2"]}
        self.assertEqual(shelf_worker.content_hash(item), shelf_worker.content_hash(same))
        self.assertNotEqual(shelf_worker.content_hash(item),
                            shelf_worker.content_hash(item | {"marks": ["loved", "disliked"]}))


class PageTitles(unittest.TestCase):
    def test_clean_title_drops_site_names(self):
        self.assertEqual(images.clean_title("Moravec's paradox - Wikipedia", "https://en.wikipedia.org/wiki/M"),
                         "Moravec's paradox")
        self.assertEqual(images.clean_title("Testosterone gave me my life back - by Cate Hall",
                                            "https://usefulfictions.substack.com/p/t"),
                         "Testosterone gave me my life back")
        self.assertEqual(images.clean_title("Exclusive: OpenAI Admitted its Nonprofit Board is About to Have a Lot Less Power",
                                            "https://www.obsolete.pub/p/x"),
                         "Exclusive: OpenAI Admitted its Nonprofit Board is About to Have a Lot Less Power")
        self.assertEqual(images.clean_title("A - B testing in practice", "https://example.com/a"),
                         "A - B testing in practice")

    def test_page_title_wins_for_links(self):
        item = {"url": "https://www.obsolete.pub/p/exclusive-what-openai-told-californias", "label":
                "exclusive what openai told californias", "needs_title": False, "shelf_row": "reading",
                "medium": "reading", "name": "x", "image_url": None, "image_source": None}
        db = mock.MagicMock()
        db.execute.return_value.fetchone.return_value = {"title": "Exclusive: OpenAI Admitted its Nonprofit Board",
                                                          "image_url": None, "source": "og"}
        shelf_worker.apply_image(db, item, {})
        self.assertEqual(item["label"], "Exclusive: OpenAI Admitted its Nonprofit Board")


class Images(unittest.TestCase):
    def test_resolution_keys(self):
        self.assertEqual(images.resolution_key({"url": "https://www.youtube.com/watch?v=abcDEF12345"}),
                         "youtube:abcDEF12345")
        book = {"url": None, "shelf_row": "books", "medium": "books", "needs_title": False,
                "name": "Out of Control", "creator": "Kevin Kelly"}
        self.assertEqual(images.resolution_key(book), "book:outofcontrol|kevinkelly")
        self.assertIsNone(images.resolution_key(book | {"needs_title": True}))

    def test_refuses_private_hosts(self):
        self.assertFalse(images._public_https("http://127.0.0.1:8123/"))
        self.assertFalse(images._public_https("file:///etc/passwd"))

    def test_openlibrary_rejects_mismatched_titles(self):
        docs = {"docs": [{"title": "Die Verfassung der Allmende", "cover_i": 1, "author_name": ["Elinor Ostrom"]},
                         {"title": "Governing the Commons", "cover_i": 2, "author_name": ["Elinor Ostrom"],
                          "language": ["eng"]}]}
        with mock.patch.object(images, "_json", return_value=docs):
            got = images.openlibrary("Governing the Commons", "Elinor Ostrom")
        self.assertEqual(got["image_url"], "https://covers.openlibrary.org/b/id/2-M.jpg")
        self.assertEqual(got["title"], "Governing the Commons")

    def test_openlibrary_accepts_handle_creator_on_exact_title(self):
        docs = {"docs": [{"title": "The Better Angels of Our Nature", "cover_i": 3, "author_name": ["Steven Pinker"]}]}
        with mock.patch.object(images, "_json", return_value=docs):
            got = images.openlibrary("Better Angels of Our Nature", "sapinker")
        self.assertTrue(got["found"])


if __name__ == "__main__":
    unittest.main()


class ShortLinks(unittest.TestCase):
    def setUp(self):
        import shortlinks
        self.sl = shortlinks

    def test_uncovered_codes(self):
        t = {"text": "see https://t.co/AAAA1111 and https://t.co/BBBB2222", "short_urls": ["https://t.co/AAAA1111"]}
        self.assertEqual(self.sl.uncovered_codes(t), ["BBBB2222"])

    def test_apply_adds_targets_and_drops_tweet_links(self):
        t = {"text": "x https://t.co/BBBB2222 https://t.co/CCCC3333", "short_urls": [], "urls": []}
        self.sl.apply([t], {"BBBB2222": "https://youtu.be/abcDEF12345",
                            "CCCC3333": "https://x.com/someone/status/1/photo/1"})
        self.assertEqual(t["urls"], ["https://youtu.be/abcDEF12345"])
        self.assertTrue(t["augmented"])

    def test_stops_after_repeated_throttling(self):
        recorded = []
        summary = self.sl.resolve_codes(["a1b2", "c3d4"], lambda *r: recorded.append(r), workers=1,
                                        fetch=lambda code: (429, None, "1"), sleep=lambda s: None)
        self.assertIn("throttles in a row", summary["stopped"])
        self.assertEqual(recorded, [])
        self.assertEqual(summary["statuses"], {429: 5})

    def test_records_redirects(self):
        recorded = []
        summary = self.sl.resolve_codes(["a1b2"], lambda *r: recorded.append(r),
                                        fetch=lambda code: (301, "https://example.com/a", None), sleep=lambda s: None)
        self.assertEqual(recorded, [("a1b2", 301, "https://example.com/a")])
        self.assertIsNone(summary["stopped"])
