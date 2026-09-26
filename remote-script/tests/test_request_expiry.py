# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: GPL-3.0-or-later

"""A request's `expires_in_ms`: Live skips a job it gets to too late.

Run: PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s remote-script/tests
"""

import os
import queue
import sys
import threading
import time
import types
import unittest

# Keep __pycache__ out of the checkout.
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# Only Live's own Python has this module; the package imports it on load.
sys.modules.setdefault("Live", types.ModuleType("Live"))

from Producer_Pal import bridge  # noqa: E402


class Handler:
    """A route handler that records its calls."""

    def __init__(self):
        self.calls = 0

    def __call__(self, _bridge, _params):
        self.calls += 1
        return {"ok": True}


class BlockingHandler(Handler):
    """A route handler that says it started, then runs until released."""

    def __init__(self):
        super().__init__()
        self.started = threading.Event()
        self.release = threading.Event()

    def __call__(self, bridge_, params):
        self.started.set()
        self.release.wait(5)
        return super().__call__(bridge_, params)


class TimeoutRecorder:
    """Stands in for a job's reply queue: records the wait, then times out."""

    def __init__(self):
        self.timeouts = []

    def get(self, timeout=None):
        self.timeouts.append(timeout)
        raise queue.Empty


def job(handler, expires_in):
    """A job that expires `expires_in` seconds from now, or never for None."""
    expires_at = None if expires_in is None else time.monotonic() + expires_in
    return bridge._Job(handler, None, {}, expires_at)


def dispatch(handler, params):
    """POST /load through the bridge, with Live running each job as it's queued."""
    surface = object.__new__(bridge.ProducerPalBridge)
    surface._jobs = types.SimpleNamespace(put=lambda queued: queued.run())
    original = bridge.ROUTES["/load"]
    bridge.ROUTES["/load"] = handler
    try:
        return surface._dispatch("POST", "/load", params)
    finally:
        bridge.ROUTES["/load"] = original


class ExpiryTest(unittest.TestCase):
    def test_skips_a_job_that_expired_before_live_ran_it(self):
        handler = Handler()
        expired = job(handler, -1)

        expired.run()

        self.assertEqual(handler.calls, 0)
        self.assertEqual(
            expired.wait(),
            (
                504,
                {
                    "error": "the request expired before Live ran it"
                    "; nothing changed, re-run it"
                },
            ),
        )

    def test_runs_a_job_before_it_expires(self):
        handler = Handler()
        pending = job(handler, 60)

        pending.run()

        self.assertEqual(handler.calls, 1)
        self.assertEqual(pending.wait(), (200, {"ok": True}))

    def test_waits_30s_with_no_expiry(self):
        pending = job(Handler(), None)
        pending._reply = TimeoutRecorder()

        status, payload = pending.wait()

        self.assertEqual(pending._reply.timeouts, [30.0])
        self.assertEqual(status, 504)
        self.assertEqual(
            payload["error"],
            "Live did not run the request within 30.0s; nothing changed, re-run it",
        )

    def test_waits_until_an_expiry_sooner_than_30s(self):
        pending = job(Handler(), 5)
        pending._reply = TimeoutRecorder()

        pending.wait()

        self.assertAlmostEqual(pending._reply.timeouts[0], 5, delta=0.5)

    def test_waits_30s_when_the_expiry_is_later(self):
        pending = job(Handler(), 100)
        pending._reply = TimeoutRecorder()

        pending.wait()

        self.assertEqual(pending._reply.timeouts, [30.0])

    def test_skips_a_job_the_http_side_gave_up_on(self):
        handler = Handler()
        pending = job(handler, 0)

        self.assertEqual(pending.wait()[0], 504)
        pending.run()

        self.assertEqual(handler.calls, 0)

    def test_replies_for_a_job_that_started_before_it_expired(self):
        # It's still running at its expiry, so the HTTP side waits it out.
        handler = BlockingHandler()
        pending = job(handler, 60)
        runner = threading.Thread(target=pending.run)
        runner.start()
        handler.started.wait(5)
        pending._expires_at = time.monotonic() - 1
        threading.Timer(0.05, handler.release.set).start()

        self.assertEqual(pending.wait(), (200, {"ok": True}))
        runner.join()

    def test_stops_waiting_on_a_started_job_that_never_finishes(self):
        handler = BlockingHandler()
        pending = job(handler, None)
        runner = threading.Thread(target=pending.run)
        runner.start()
        handler.started.wait(5)
        original = bridge.REQUEST_TIMEOUT
        bridge.REQUEST_TIMEOUT = 0.05
        try:
            status, payload = pending.wait()
        finally:
            bridge.REQUEST_TIMEOUT = original
            handler.release.set()
        runner.join()

        self.assertEqual(status, 504)
        self.assertIn("didn't finish", payload["error"])


class DispatchTest(unittest.TestCase):
    def test_runs_a_request_with_time_left(self):
        handler = Handler()

        self.assertEqual(
            dispatch(handler, {"expires_in_ms": 60000}), (200, {"ok": True})
        )
        self.assertEqual(handler.calls, 1)

    def test_takes_expires_in_ms_from_a_query_string(self):
        self.assertEqual(dispatch(Handler(), {"expires_in_ms": "60000"})[0], 200)

    def test_skips_a_request_that_has_expired(self):
        handler = Handler()

        status, payload = dispatch(handler, {"expires_in_ms": 0})

        self.assertEqual(status, 504)
        self.assertIn("expired", payload["error"])
        self.assertEqual(handler.calls, 0)

    def test_refuses_a_bad_expires_in_ms(self):
        for value in (-1, "soon", True, float("nan"), [5]):
            with self.subTest(value=value):
                handler = Handler()

                status, payload = dispatch(handler, {"expires_in_ms": value})

                self.assertEqual(status, 400)
                self.assertIn("expires_in_ms must be a number", payload["error"])
                self.assertEqual(handler.calls, 0)


if __name__ == "__main__":
    unittest.main()
