# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""/undo/end with a fake song.

Run: PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s remote-script/tests
"""

import os
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

from Producer_Pal import bridge, routes  # noqa: E402


class UndoEndTest(unittest.TestCase):
    def test_it_ends_the_pending_undo_step_and_never_begins_one(self):
        calls = []
        song = types.SimpleNamespace(
            begin_undo_step=lambda: calls.append("begin"),
            end_undo_step=lambda: calls.append("end"),
        )
        result = routes.ROUTES["/undo/end"](types.SimpleNamespace(song=song), {})
        self.assertEqual(result, {"ok": True})
        self.assertEqual(calls, ["end"])

    def test_it_refuses_get(self):
        self.assertIn("/undo/end", routes.POST_ONLY)


def dispatch_end(deadline_in_ms, wait):
    """POST /undo/end through the bridge; Live runs the job `wait` seconds after
    it is queued. Returns the reply and the calls the song saw."""
    calls = []
    song = types.SimpleNamespace(end_undo_step=lambda: calls.append("end"))
    surface = object.__new__(bridge.ProducerPalBridge)
    surface._c_instance = types.SimpleNamespace(song=lambda: song)
    surface._jobs = types.SimpleNamespace(
        put=lambda queued: threading.Timer(wait, queued.run).start()
    )
    deadline = time.time() * 1000.0 + deadline_in_ms
    reply = surface._dispatch("POST", "/undo/end", {"expires_at_ms": deadline})
    return reply, calls


class UndoEndExpiryTest(unittest.TestCase):
    def test_a_late_end_is_dropped(self):
        # Live gets to it after the deadline: the end never runs, so it can't
        # close a later write's step halfway.
        reply, calls = dispatch_end(50, 0.2)
        self.assertEqual(reply[0], 504)
        time.sleep(0.3)
        self.assertEqual(calls, [])

    def test_an_end_in_time_runs(self):
        reply, calls = dispatch_end(2000, 0)
        self.assertEqual(reply, (200, {"ok": True}))
        self.assertEqual(calls, ["end"])


if __name__ == "__main__":
    unittest.main()
