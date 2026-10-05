# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""Browser paths for names holding "/" or accents, with fake Live objects.

Live shows a ":" in a macOS file name as "/", and composes accents.

Run: PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s remote-script/tests
"""

import os
import sys
import types
import unittest
from unittest import mock

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.modules.setdefault("Live", types.ModuleType("Live"))

from Producer_Pal import browser  # noqa: E402


class FakeItem:
    def __init__(self, name, children=()):
        self.name = name
        self.children = list(children)
        self.is_loadable = not children
        self.is_device = False


COLON_FILE = FakeItem("Amb (3/4).adv")
FOLDER_FILE = FakeItem("4).adv")
NESTED = FakeItem("File a/b.adv")
ACCENTED = FakeItem("T\u00e9st.adv")

PRESETS = FakeItem(
    "Presets",
    [
        COLON_FILE,
        FakeItem("Amb (3", [FOLDER_FILE]),
        FakeItem("Folder a/b", [NESTED]),
        ACCENTED,
    ],
)


def fake_browser(user_library=FakeItem("User Library", [FakeItem("-")])):
    return types.SimpleNamespace(
        user_library=user_library,
        packs=FakeItem("Packs", [FakeItem("-")]),
        user_folders=[PRESETS],
    )


def find(file_path, **kwargs):
    return browser.find_file(fake_browser(**kwargs), file_path)


class FindFileTest(unittest.TestCase):
    def test_colon_in_folder_and_file(self):
        item, path = find("/Users/me/Presets/Folder a:b/File a:b.adv")
        self.assertIs(item, NESTED)
        self.assertEqual(path, "Places/Presets/Folder a:b/File a:b.adv")

    def test_colon_file_and_file_in_folder_stay_apart(self):
        self.assertIs(find("/Users/me/Presets/Amb (3:4).adv")[0], COLON_FILE)
        self.assertIs(find("/Users/me/Presets/Amb (3/4).adv")[0], FOLDER_FILE)

    def test_decomposed_accent_on_disk(self):
        self.assertIs(find("/Users/me/Presets/Te\u0301st.adv")[0], ACCENTED)

    def test_windows_path(self):
        self.assertIs(find("C:\\Users\\me\\Presets\\T\u00e9st.adv")[0], ACCENTED)

    def test_user_library(self):
        library = FakeItem("User Library", [FakeItem("Folder a/b", [NESTED])])
        with mock.patch.object(browser, "_USER_LIBRARY", "/Users/me/Lib a:b"):
            item, path = find(
                "/Users/me/Lib a:b/Folder a:b/File a:b.adv", user_library=library
            )
        self.assertIs(item, NESTED)
        self.assertEqual(path, "User Library/Folder a:b/File a:b.adv")

    def test_missing(self):
        with self.assertRaises(LookupError):
            find("/Users/me/Presets/Folder a/b/File a/b.adv")


class BrowserPathTest(unittest.TestCase):
    def test_listed_paths_resolve_to_the_same_items(self):
        for entry in browser.list_loadable(PRESETS, "", False):
            item, path = browser.resolve_path(PRESETS, entry["path"])
            self.assertEqual(path, entry["path"])
            self.assertEqual(browser._path_name(item.name), path.split("/")[-1])

    def test_listed_paths_write_slash_as_colon(self):
        paths = [entry["path"] for entry in browser.list_loadable(PRESETS, "", False)]
        self.assertEqual(
            paths,
            ["Amb (3:4).adv", "Amb (3/4).adv", "Folder a:b/File a:b.adv", "T\u00e9st.adv"],
        )

    def test_not_found_lists_choices_in_path_form(self):
        with self.assertRaises(browser.PathNotFound) as caught:
            browser.resolve_path(PRESETS, "Nope")
        self.assertIn("Folder a:b", caught.exception.choices)


class NameMatchTest(unittest.TestCase):
    def test_either_spelling_matches(self):
        for name in ("Amb (3/4)", "Amb (3:4)"):
            self.assertEqual(
                [item for item, _ in browser.match_items(PRESETS, name, False)],
                [COLON_FILE],
            )

    def test_query_filter_matches_either_spelling(self):
        for query in ("a/b", "a:b"):
            names = [
                entry["name"]
                for entry in browser.list_loadable(PRESETS, "", False, query)
            ]
            self.assertEqual(names, ["File a/b.adv"])

    def test_works_without_unicodedata(self):
        with mock.patch.object(browser, "unicodedata", None):
            self.assertEqual(browser._path_name("Amb (3/4)"), "Amb (3:4)")

    def test_same_name_ignores_spelling_and_accents(self):
        self.assertTrue(browser.same_name("Amb (3/4)", "Amb (3:4).adv"))
        self.assertTrue(browser.same_name("Te\u0301st", "T\u00e9st.adv"))


if __name__ == "__main__":
    unittest.main()
