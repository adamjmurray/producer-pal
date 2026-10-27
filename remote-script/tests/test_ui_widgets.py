# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""/ui-widgets with a fake song.

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

from Producer_Pal import routes, ui_widgets  # noqa: E402
from Producer_Pal.errors import RouteError  # noqa: E402


class FakeSong:
    """Keeps data like `song.set_data` / `song.get_data`."""

    def __init__(self):
        self.data = {}

    def set_data(self, key, value):
        self.data[key] = value

    def get_data(self, key, default=None):
        return self.data.get(key, default)


def call(route, song, params=None):
    return routes.ROUTES[route](types.SimpleNamespace(song=song), params or {})


class UiWidgetsTest(unittest.TestCase):
    def test_a_set_with_nothing_saved_reads_null(self):
        self.assertEqual(call("/ui-widgets", FakeSong()), {"text": None})

    def test_what_was_saved_reads_back(self):
        song = FakeSong()
        self.assertEqual(
            call("/ui-widgets/save", song, {"text": '{"v":1}'}), {"ok": True}
        )
        self.assertEqual(call("/ui-widgets", song), {"text": '{"v":1}'})
        self.assertEqual(song.data, {ui_widgets.KEY: '{"v":1}'})

    def test_saving_again_replaces_the_list(self):
        song = FakeSong()
        call("/ui-widgets/save", song, {"text": "a"})
        call("/ui-widgets/save", song, {"text": "b"})
        self.assertEqual(call("/ui-widgets", song), {"text": "b"})

    def test_something_else_under_the_key_reads_as_nothing_saved(self):
        song = FakeSong()
        song.data[ui_widgets.KEY] = {"not": "text"}
        self.assertEqual(call("/ui-widgets", song), {"text": None})

    def test_a_list_at_the_cap_is_kept(self):
        song = FakeSong()
        text = "x" * ui_widgets.MAX_CHARS
        call("/ui-widgets/save", song, {"text": text})
        self.assertEqual(call("/ui-widgets", song), {"text": text})

    def test_a_list_over_the_cap_is_refused_and_keeps_the_old_one(self):
        song = FakeSong()
        call("/ui-widgets/save", song, {"text": "old"})
        with self.assertRaises(RouteError) as caught:
            call("/ui-widgets/save", song, {"text": "x" * (ui_widgets.MAX_CHARS + 1)})
        self.assertEqual(caught.exception.status, 413)
        self.assertEqual(caught.exception.payload["limit"], ui_widgets.MAX_CHARS)
        self.assertEqual(call("/ui-widgets", song), {"text": "old"})

    def test_text_that_is_not_a_string_is_refused(self):
        for params in ({}, {"text": None}, {"text": 5}, {"text": ["a"]}):
            with self.assertRaises(RouteError) as caught:
                call("/ui-widgets/save", FakeSong(), params)
            self.assertEqual(caught.exception.status, 400)

    def test_saving_refuses_get(self):
        self.assertIn("/ui-widgets/save", routes.POST_ONLY)
        self.assertNotIn("/ui-widgets", routes.POST_ONLY)


if __name__ == "__main__":
    unittest.main()
