"""Unit tests that need no database or network.

  cd services/shelf && uv run --with 'psycopg[binary]==3.2.9' python -m unittest test_shelf -v
"""
import os
import unittest
from unittest import mock

import echoes
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
        merged = view.merge_works([a, b])
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]["marks"], ["loved", "recommended"])
        self.assertEqual(merged[0]["image_url"], "https://x/y.jpg")
        self.assertEqual(merged[0]["evidence_tweet_ids"], ["2", "1"])

    def work(self, key, row, label, n=1, url=None, medium=None, needs_title=False):
        return {"work_key": key, "shelf_row": row, "medium": medium or row, "label": label,
                "needs_title": needs_title, "url": url, "creator": None, "marks": [],
                "evidence_tweet_ids": [f"{key}{i}" for i in range(n)], "first_at": "2024",
                "last_at": "2025", "image_url": None, "image_source": None}

    def test_a_film_with_and_without_its_year_is_one_work(self):
        items = [self.work("name:happytogether", "watching", "Happy Together", 2),
                 self.work("name:happytogether1997", "watching", "Happy Together (1997)", 1)]
        self.assertEqual(len(view.merge_works(items)), 1)

    def test_book_under_subtitles_and_store_links_is_one_work(self):
        items = [self.work("name:obsolete", "made", "Obsolete", 31, medium="books"),
                 self.work("name:obsoletetheai", "made", "Obsolete: The AI Industry's Trillion-Dollar Race", 9, medium="books"),
                 self.work("url:obsoletebook.org", "books", "Obsolete: The AI Industry", 22, url="https://www.obsoletebook.org/"),
                 self.work("name:obsoletepower", "made", "Obsolete: Power, Profit, and the Race", 2, medium="books"),
                 self.work("unnamed:1:untitledbook", "books", "Untitled book", needs_title=True),
                 self.work("unnamed:2:untitledbook", "books", "Untitled book", needs_title=True)]
        merged = view.merge_works(items, keep={"url:obsoletebook.org"})
        books = [i for i in merged if view.main_title(i["label"]) == "obsolete"]
        self.assertEqual(len(books), 1)
        self.assertEqual(books[0]["work_key"], "url:obsoletebook.org")  # the approved key survives
        self.assertEqual(books[0]["shelf_row"], "made")  # 42 of 64 tweets say made
        self.assertEqual(books[0]["label"], "Obsolete: The AI Industry's Trillion-Dollar Race")
        self.assertEqual(len(books[0]["evidence_tweet_ids"]), 64)
        self.assertEqual(sum(i["label"] == "Untitled book" for i in merged), 2)  # placeholders stay apart

    def test_mirrors_join_their_post_and_own_host_is_made(self):
        post = "https://www.obsolete.pub/p/the-end-of-openais-nonprofit-era"
        mirror = "https://api.omarshehata.me/substack-proxy/articles/www-obsolete-pub-p-the-end-of-openais-nonprofit-era.html"
        self.assertEqual(view.origin_url(mirror), "https://obsolete.pub/p/the-end-of-openais-nonprofit-era")
        self.assertEqual(view.origin_url("https://web.archive.org/web/2024id_/https://example.com/a"), "https://example.com/a")
        items = [self.work("url:a", "reading", "The End of OpenAI's Nonprofit Era", 2, url=mirror),
                 self.work("url:b", "made", "The End of OpenAI’s Nonprofit Era", 1, url=post),
                 self.work("url:c", "made", "Another post", url="https://www.obsolete.pub/p/another"),
                 self.work("url:d", "made", "Third post", url="https://www.obsolete.pub/p/third"),
                 self.work("url:e", "reading", "Someone else's essay", url="https://example.com/essay")]
        merged = {i["label"]: i for i in view.merge_works(items)}
        self.assertEqual(len(merged), 4)
        self.assertEqual(merged["The End of OpenAI's Nonprofit Era"]["shelf_row"], "made")
        self.assertEqual(merged["Someone else's essay"]["shelf_row"], "reading")

    def flavor(self, **p):
        a = {"consumption_stated": .1, "reacts": .1, "recommends": .1, "cites": .1, "alludes": .1, "judgement": .1}
        return a | p

    def test_mention_flavor_relations(self):
        f = view.mention_flavor
        self.assertIsNone(f({"engaged": .9}, {"text": "x"}))  # before the flavor stage
        played = self.flavor(consumption_stated=.9, consumption={"choice": "experienced"}, reacts=.9)
        self.assertEqual(f(played, {"text": "great game"})["relation"], "experienced")
        self.assertEqual(f(self.flavor(consumption_stated=.5, consumption={"choice": "experienced"}, reacts=.9),
                           {"text": "x"})["relation"], "discussed")  # consumption not stated firmly enough
        self.assertEqual(f(self.flavor(cites=.9), {"text": "per this report https://t.co/x"})["relation"], "cited")
        self.assertEqual(f(self.flavor(alludes=.6), {"text": "very Black Mirror"})["relation"], "referenced")
        self.assertEqual(f(self.flavor(), {"text": "@a https://t.co/x"})["relation"], "shared")
        self.assertEqual(f(self.flavor(), {"text": "Wolfe and Lord of the Rings"})["relation"], "mentioned")
        loved = f(self.flavor(judgement=.9, sentiment={"score": 2.8}, recommends=.9), {"text": "x"})
        self.assertEqual((loved["sentiment"], loved["recommends"]), ("loved", True))

    def test_build_uses_flavors_over_legacy_stance(self):
        ms = [mention("mention:00000000000e", "1", "Out of Control", "Out of Control"),
              mention("mention:00000000000f", "2", "Out of Control", "Out of Control")]
        tweets = {"1": {"created_at": "2024-01-01T00:00:00Z", "urls": [], "text": "per Out of Control"},
                  "2": {"created_at": "2025-01-01T00:00:00Z", "urls": [], "text": "finally read Out of Control, loved it"}}
        answers = {"mention:00000000000e": {"engaged": .9, "warm": .1} | self.flavor(cites=.9),
                   "mention:00000000000f": {"engaged": .9, "warm": .9} | self.flavor(
                       consumption_stated=.95, consumption={"choice": "experienced"}, reacts=.9,
                       judgement=.9, sentiment={"score": 3.0})}
        item = [i for i in view.build(tweets, ms, answers) if i["shelf_row"] != "links"][0]
        self.assertEqual((item["shelf_row"], item["relation"], item["marks"]), ("books", "experienced", ["loved"]))
        only_shared = view.build({"1": tweets["1"] | {"text": "https://t.co/x"}}, ms[:1],
                                 {"mention:00000000000e": {"engaged": .9} | self.flavor()})
        self.assertEqual([(i["shelf_row"], i["relation"]) for i in only_shared if i["shelf_row"] != "links"],
                         [("mentioned", "shared")])  # a bare link is not a book on the shelf

    def test_formats_from_namer_kinds(self):
        self.assertEqual(view.work_format(["film", "Film", "youtube video"], "watching"), "film")
        self.assertEqual(view.work_format(["TV show"], "watching"), "tv")
        self.assertEqual(view.work_format(["television series"], "watching"), "tv")
        self.assertEqual(view.work_format(["youtube video"], "watching"), "video")
        self.assertEqual(view.work_format(["podcast episode"], "listening"), "podcast")
        self.assertEqual(view.work_format(["album"], "listening"), "music")
        self.assertIsNone(view.work_format(["book"], "books"))  # media without formats

    def test_reading_claims_need_approval(self):
        base = {"shelf_row": "books", "label": "Dune", "creator": None, "url": None, "marks": []}
        self.assertEqual(shelf_worker.content_hash(base | {"relation": "cited"}), shelf_worker.content_hash(base))
        self.assertNotEqual(shelf_worker.content_hash(base | {"relation": "experienced"}),
                            shelf_worker.content_hash(base))

    def test_tool_and_its_tagline_page_are_one_work(self):
        items = [self.work("name:roamresearch", "tools", "Roam Research", 165),
                 self.work("url:roamresearch.com", "tools", "Roam Research – A note taking tool for networked thought",
                           12, url="https://roamresearch.com/")]
        merged = view.merge_works(items)
        self.assertEqual([(i["label"], len(i["evidence_tweet_ids"])) for i in merged], [("Roam Research", 177)])

    def test_same_title_in_another_medium_is_another_work(self):
        items = [self.work("name:humankind", "books", "Humankind", medium="books"),
                 self.work("name:humankindpod", "listening", "Humankind", medium="listening")]
        self.assertEqual(len(view.merge_works(items)), 2)

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
        self.assertEqual(got["image_url"], "https://covers.openlibrary.org/b/id/2-L.jpg")
        self.assertEqual(got["title"], "Governing the Commons")

    def test_openlibrary_accepts_handle_creator_on_exact_title(self):
        docs = {"docs": [{"title": "The Better Angels of Our Nature", "cover_i": 3, "author_name": ["Steven Pinker"]}]}
        with mock.patch.object(images, "_json", return_value=docs) as search:
            got = images.openlibrary("Better Angels of Our Nature", "@sapinker")
        self.assertTrue(got["found"])
        # A handle would sink the search, so it stays out of the query.
        self.assertNotIn("sapinker", search.call_args.args[0])

    def test_openlibrary_matches_the_english_edition_of_a_translated_work(self):
        docs = {"docs": [{"title": "Le città invisibili", "cover_i": 4, "author_name": ["Italo Calvino"],
                          "editions": {"docs": [{"title": "Invisible cities", "cover_i": 5}]}}]}
        with mock.patch.object(images, "_json", return_value=docs):
            got = images.openlibrary("Invisible Cities", "Calvino")
        self.assertEqual(got["image_url"], "https://covers.openlibrary.org/b/id/5-L.jpg")
        self.assertEqual(got["title"], "Invisible cities")

    def test_openlibrary_takes_a_series_first_book_but_not_a_longer_one_word_title(self):
        docs = {"docs": [{"title": "Harry Potter and the Philosopher's Stone", "cover_i": 6,
                          "author_name": ["J. K. Rowling"]}]}
        with mock.patch.object(images, "_json", return_value=docs):
            self.assertTrue(images.openlibrary("harry potter", None)["found"])
        docs = {"docs": [{"title": "Memorial Day", "cover_i": 7, "author_name": ["Someone"]}]}
        with mock.patch.object(images, "_json", return_value=docs):
            self.assertFalse(images.openlibrary("Memorial", None)["found"])

    def test_wikipedia_takes_the_page_whose_description_names_the_kind(self):
        pages = {"query": {"pages": [
            {"index": 1, "title": "Portal", "description": "Topics referred to by the same term"},
            {"index": 2, "title": "Portal (video game)", "description": "2007 video game",
             "thumbnail": {"source": "https://upload.wikimedia.org/portal.png"}}]}}
        with mock.patch.object(images, "_json", return_value=pages):
            got = images.wikipedia("Portal", None, "game")
        self.assertEqual(got["image_url"], "https://upload.wikimedia.org/portal.png")
        self.assertEqual(got["title"], "Portal")
        named = {"shelf_row": "watching", "medium": "watching", "name": "Blade Runner", "creator": None,
                 "needs_title": False, "url": None}
        self.assertEqual(images.resolution_key(named), "screen:bladerunner|")

    def test_wikipedia_music_needs_the_artist_or_a_longer_title(self):
        pages = {"query": {"pages": [{"index": 1, "title": "Blonde (Frank Ocean album)",
                                      "description": "2016 studio album by Frank Ocean",
                                      "thumbnail": {"source": "https://upload.wikimedia.org/blonde.jpg"}}]}}
        with mock.patch.object(images, "_json", return_value=pages):
            self.assertFalse(images.wikipedia("Blonde", None, "listen")["found"])
            self.assertTrue(images.wikipedia("Blonde", "Frank Ocean", "listen")["found"])
            self.assertFalse(images.wikipedia("Blonde", "Beyoncé", "listen")["found"])

    def test_wikipedia_follows_redirects_and_picks_the_named_year(self):
        found = {"query": {
            "redirects": [{"from": "Hausu", "to": "House (1977 film)"}],
            "pages": [{"title": "House (1977 film)", "description": "1977 film by Nobuhiko Obayashi",
                       "thumbnail": {"source": "https://upload.wikimedia.org/house.jpg"}}]}}
        with mock.patch.object(images, "_json", return_value=found):
            self.assertEqual(images.wikipedia("Hausu", None, "screen")["title"], "House")
        remakes = {"query": {"pages": [
            {"title": "Deep End", "description": "1970 film by Jerzy Skolimowski",
             "thumbnail": {"source": "https://upload.wikimedia.org/1970.jpg"}},
            {"title": "Deep End (1979 film)", "description": "1979 film",
             "thumbnail": {"source": "https://upload.wikimedia.org/1979.jpg"}}]}}
        with mock.patch.object(images, "_json", return_value=remakes):
            got = images.wikipedia("Deep End (1979)", None, "screen")
        self.assertEqual(got["image_url"], "https://upload.wikimedia.org/1979.jpg")

    def test_matching_folds_accents_and_keeps_a_title_s_own_parentheses(self):
        self.assertEqual(images.similarity("amelie", "Amélie"), 1.0)
        self.assertEqual(images.QUALIFIER.sub("", "Lions, Love (...and Lies)"), "Lions, Love (...and Lies)")
        self.assertEqual(images.QUALIFIER.sub("", "Blonde (Frank Ocean album)"), "Blonde")

    def test_a_linked_film_is_looked_up_by_its_poster_first(self):
        film = {"shelf_row": "watching", "medium": "watching", "format": "film", "name": "Inside Out",
                "creator": None, "needs_title": False, "url": "https://youtu.be/fOALVbuXNeQ"}
        self.assertEqual(images.poster_key(film), "screen:insideout|")
        self.assertIsNone(images.poster_key(film | {"format": "video"}))  # a YouTube video is its own thumbnail

    def test_a_failed_lookup_is_not_cached_as_a_miss(self):
        with mock.patch.object(images, "_json", return_value=None):
            with self.assertRaises(images.LookupFailed):
                images.openlibrary("Black Box Thinking", None)
        with mock.patch.object(images, "_global_ip", return_value=None):
            with self.assertRaises(images.LookupFailed):
                images._get("https://openlibrary.org/search.json?q=x", gap=0, strict=True)
            self.assertIsNone(images._get("https://openlibrary.org/search.json?q=x", gap=0))


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


def item(key, row, label, url=None, creator=None, needs_title=False):
    return {"work_key": key, "shelf_row": row, "label": label, "url": url, "creator": creator,
            "needs_title": needs_title}


def tweet(tid, account, text, urls=(), is_retweet=False):
    return {"tweet_id": tid, "account_id": account, "text": text, "urls": list(urls),
            "is_retweet": is_retweet}


class Echoes(unittest.TestCase):
    ITEMS = [
        item("name:outofcontrol", "books", "Out of Control", creator="Kevin Kelly"),
        item("name:governingthecommons", "books", "Governing the Commons"),
        item("name:thealignmentproblem", "books", "the Alignment Problem"),
        item("name:elephantinthebrain", "books", "Elephant in the Brain",
             creator="@kevinsimler and @robinhanson"),
        item("name:hobbit", "books", "Hobbit"),
        item("name:commarchive", "reading", "comm_archive", creator="@exgenesis"),
        item("url:youtube:abcDEF12345", "watching", "A talk", url="https://youtu.be/abcDEF12345"),
        item("url:example.com/essay", "reading", "An essay", url="https://www.example.com/Essay/"),
        item("name:chatgpt", "tools", "ChatGPT"),
        item("url:read-next.com", "reading", "read-next", url="http://read-next.com"),
        item("url:youtube.com/playlist", "made", "YouTube video",
             url="https://www.youtube.com/playlist?list=PL123", needs_title=True),
    ]

    def test_targets(self):
        t = echoes.targets(self.ITEMS)
        self.assertEqual(t["name:outofcontrol"]["title"]["names"], {"kelly"})
        self.assertEqual(t["name:outofcontrol"]["title"]["cues"], set())  # not distinctive alone
        self.assertEqual(t["name:elephantinthebrain"]["title"]["names"], {"kevinsimler", "robinhanson"})
        self.assertIn("book", t["name:governingthecommons"]["title"]["cues"])
        self.assertNotIn("name:hobbit", t)  # one word, no creator
        self.assertNotIn("name:commarchive", t)  # a handle, not a work
        self.assertEqual(t["url:youtube:abcDEF12345"]["link"], "youtube:abcDEF12345")
        self.assertEqual(t["url:example.com/essay"]["link"], "example.com/essay")
        self.assertNotIn("name:chatgpt", t)  # tools never echo
        self.assertNotIn("url:read-next.com", t)  # a bare site would match every link to it
        self.assertNotIn("url:youtube.com/playlist", t)  # identity is in the query string

    def test_match_rules(self):
        tweets = [
            tweet("10", "a", "Reading Governing the Commons this week"),
            tweet("11", "b", "everything is out of control today"),
            tweet("12", "c", "Kevin Kelly's Out of Control holds up"),
            tweet("13", "d", "watch this", urls=["https://www.youtube.com/watch?v=abcDEF12345&t=3"]),
            tweet("14", "e", "good", urls=["https://example.com/essay?utm_source=x&s=20"]),
            tweet("15", "owner", "my own book tweet about Governing the Commons"),
            tweet("16", "f", "RT @x: reading Governing the Commons"),
            tweet("17", "g", "book on Governing the Commonsense way"),
            tweet("18", "c", "Kelly again on out of control", urls=["https://example.com/essay"]),
            tweet("19", "h", "the alignment problem is the hardest book-length question"),
            tweet("20", "i", "just finished reading The Alignment Problem"),
            tweet("21", "j", "Governing the Commons is underrated"),
            tweet("22", "k", "@robinhanson on the elephant in the brain again"),
            tweet("23", "l", "playlist", urls=["https://www.youtube.com/playlist?list=PL999"]),
        ]
        found = echoes.match(echoes.targets(self.ITEMS), tweets, "owner")
        self.assertEqual(found[("name:governingthecommons", "a")], {"tweet_ids": ["10"], "match": "title"})
        self.assertNotIn(("name:outofcontrol", "b"), found)  # generic phrase without the creator
        self.assertEqual(found[("name:outofcontrol", "c")]["tweet_ids"], ["12", "18"])
        self.assertEqual(found[("url:youtube:abcDEF12345", "d")]["match"], "url")
        self.assertEqual(found[("url:example.com/essay", "e")]["match"], "url")
        self.assertEqual(found[("url:example.com/essay", "c")]["match"], "url")
        self.assertNotIn(("name:governingthecommons", "owner"), found)
        self.assertNotIn(("name:governingthecommons", "f"), found)  # retweets are not echoes
        self.assertNotIn(("name:governingthecommons", "g"), found)  # word boundaries
        self.assertNotIn(("name:thealignmentproblem", "h"), found)  # the concept, lowercase
        self.assertIn(("name:thealignmentproblem", "i"), found)  # the book: title case and a cue
        self.assertNotIn(("name:governingthecommons", "j"), found)  # title case but no cue word
        self.assertIn(("name:elephantinthebrain", "k"), found)  # a creator handle
        self.assertFalse(any(k[1] == "l" for k in found))
