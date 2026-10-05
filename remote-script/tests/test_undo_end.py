# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: GPL-3.0-or-later

"""/undo/end with a fake song.

Run: PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s remote-script/tests
"""

import os
import sys
import types
import unittest

# Keep __pycache__ out of the checkout.
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# Only Live's own Python has this module; the package imports it on load.
sys.modules.setdefault("Live", types.ModuleType("Live"))

from Producer_Pal import routes  # noqa: E402


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


if __name__ == "__main__":
    unittest.main()
