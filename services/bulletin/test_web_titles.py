"""Title hook loop, without network calls."""
import unittest
import urllib.error

import web_titles

ENV = {'BULLETIN_TITLES_URL': 'https://example.invalid/api/bulletin/titles',
    'BULLETIN_TITLES_SECRET': 's'*40}


class Clock:
    def __init__(self): self.now = 0
    def __call__(self): return self.now


class WebTitleTests(unittest.TestCase):
    def test_not_configured_makes_no_request(self):
        calls = []
        result = web_titles.request_titles(10_000, post=lambda *a: calls.append(a), env={})
        self.assertEqual(result, {'status': 'not_configured'})
        self.assertEqual(calls, [])

    def test_repeats_until_nothing_remains(self):
        replies = iter([dict(attempted=20, titled=18, untitled=1, failed=1, remaining=5),
            dict(attempted=5, titled=5, untitled=0, failed=0, remaining=0)])
        clock = Clock()
        def post(url, secret, limit):
            self.assertEqual((url, secret, limit), (ENV['BULLETIN_TITLES_URL'], ENV['BULLETIN_TITLES_SECRET'], web_titles.PER_REQUEST))
            clock.now += 60
            return next(replies)
        result = web_titles.request_titles(10_000, post=post, clock=clock, env=ENV)
        self.assertEqual(result, dict(status='ok', requests=2, titled=23, untitled=1, failed=1, remaining=0))

    def test_stops_when_a_request_could_overrun_the_deadline(self):
        clock = Clock()
        def post(*_):
            clock.now += 200
            return dict(attempted=20, titled=20, remaining=100)
        result = web_titles.request_titles(300, post=post, clock=clock, env=ENV)
        self.assertEqual((result['status'], result['requests']), ('out_of_time', 1))

    def test_stops_when_nothing_could_be_attempted(self):
        result = web_titles.request_titles(10_000, post=lambda *_: dict(attempted=0, remaining=3),
            clock=Clock(), env=ENV)
        self.assertEqual((result['status'], result['requests'], result['remaining']), ('ok', 1, 3))

    def test_errors_are_reported_without_raising(self):
        def post(*_):
            raise urllib.error.HTTPError('https://private.invalid', 503, 'secret body', {}, None)
        result = web_titles.request_titles(10_000, post=post, clock=Clock(), env=ENV)
        self.assertEqual((result['status'], result['requests']), ('error_503', 0))
        self.assertNotIn('secret', str(result))

    def test_request_limit(self):
        result = web_titles.request_titles(10**9, post=lambda *_: dict(attempted=20, titled=20, remaining=9),
            clock=Clock(), env=ENV)
        self.assertEqual((result['status'], result['requests']), ('request_limit', web_titles.MAX_REQUESTS))


if __name__ == '__main__':
    unittest.main()
