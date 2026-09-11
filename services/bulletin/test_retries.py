"""Retry policy and allowlisted diagnostics, without network calls."""
import contextlib
import datetime as dt
from email.utils import format_datetime
import io
import json
import unittest
import urllib.error
from unittest.mock import patch

import worker


class RetryTests(unittest.TestCase):
    def error(self,code=503,headers=None):
        return urllib.error.HTTPError('https://private.invalid/token',code,'secret body',headers or {},None)

    def test_backoff_and_retry_after(self):
        with patch.object(worker.random,'uniform',return_value=0):
            self.assertEqual(worker.retry_wait(self.error(),1),2)
            self.assertEqual(worker.retry_wait(self.error(),2),5)
            self.assertEqual(worker.retry_wait(self.error(429,{'Retry-After':'20'}),1),20)
            future=format_datetime(dt.datetime.now(dt.timezone.utc)+dt.timedelta(seconds=30))
            self.assertGreater(worker.retry_wait(self.error(429,{'Retry-After':future}),1),28)
            self.assertEqual(worker.retry_wait(self.error(429,{'Retry-After':'invalid'}),1),2)
            self.assertIsNone(worker.retry_wait(self.error(429,{'Retry-After':'120'}),1))

    def test_transient_errors_only_and_three_attempts(self):
        for exc in (self.error(408),self.error(429),self.error(502),TimeoutError(),urllib.error.URLError('timeout')):
            self.assertIsNotNone(worker.retry_wait(exc,1))
            self.assertIsNone(worker.retry_wait(exc,3))
        for exc in (self.error(400),self.error(401),self.error(402),self.error(403),ValueError('invalid label')):
            self.assertIsNone(worker.retry_wait(exc,1))

    def test_log_has_only_safe_structured_metadata(self):
        out=io.StringIO()
        with contextlib.redirect_stdout(out):
            worker.log_failure(self.error(),run_id=14,call_id=2,attempt=1,stage='model_request',retry_seconds=2)
        event=json.loads(out.getvalue())
        self.assertEqual(event,dict(event='bulletin_error',run_id=14,call_id=2,attempt=1,
            stage='model_request',error_type='HTTPError',retry_seconds=2,http_status=503))


if __name__=='__main__':unittest.main()
