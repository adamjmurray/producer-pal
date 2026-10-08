# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""find_file picking the right Places folder or pack, with fake Live objects.

Run: PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s remote-script/tests
"""

import os
import sys
import tempfile
import types
import unittest
from unittest import mock

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.modules.setdefault("Live", types.ModuleType("Live"))

from Producer_Pal import browser, routes  # noqa: E402
from Producer_Pal.errors import RouteError  # noqa: E402


class FakeItem:
    def __init__(self, name, children=(), uri=None):
        self.name = name
        self.children = list(children)
        self.uri = uri
        self.is_loadable = not children
        self.is_device = False


KICK = FakeItem("kick.wav")
OTHER_KICK = FakeItem("kick.wav")
DEEP = FakeItem("deep.wav")
PACK_KICK = FakeItem("kick.wav")
PACK_KICK_2 = FakeItem("kick.wav")

MINE = FakeItem(
    "Samples",
    [KICK, FakeItem("sub", [FakeItem("dir", [DEEP])])],
    uri="userfolder:/Users/me/ProjectB/Samples",
)
ELSEWHERE = FakeItem(
    "Samples", [OTHER_KICK], uri="userfolder:/Users/me/ProjectA/Samples"
)


def fake_browser(places, packs=(), user_library=None):
    return types.SimpleNamespace(
        user_library=user_library or FakeItem("User Library", [FakeItem("-")]),
        packs=FakeItem("Packs", list(packs)),
        user_folders=list(places),
    )


def two_packs(count=2):
    return [
        FakeItem("Drums", [FakeItem("kick.wav")], uri="query:LivePacks#x/%d" % n)
        for n in range(1, count + 1)
    ]


def find(file_path, places, packs=()):
    return browser.find_file(fake_browser(places, packs), file_path)


class PlacesByLocationTest(unittest.TestCase):
    def test_same_name_folder_elsewhere_is_not_matched(self):
        with self.assertRaises(LookupError):
            find("/Users/me/Other/Samples/kick.wav", [MINE])

    def test_the_folder_at_that_location_wins(self):
        places = [ELSEWHERE, MINE]
        self.assertIs(find("/Users/me/ProjectB/Samples/kick.wav", places)[0], KICK)
        self.assertIs(
            find("/Users/me/ProjectA/Samples/kick.wav", places)[0], OTHER_KICK
        )

    def test_nested_path(self):
        item, path = find("/Users/me/ProjectB/Samples/sub/dir/deep.wav", [MINE])
        self.assertIs(item, DEEP)
        self.assertEqual(path, "Places/Samples/sub/dir/deep.wav")

    def test_case_and_trailing_slash_are_ignored(self):
        root = FakeItem("S", [KICK], uri="userfolder:/Users/Me/Proj/")
        self.assertIs(find("/users/me/proj/kick.wav", [root])[0], KICK)

    def test_percent_encoding_is_decoded(self):
        root = FakeItem("S", [KICK], uri="userfolder:/Users/me/My%20Samples")
        self.assertIs(find("/Users/me/My Samples/kick.wav", [root])[0], KICK)

    def test_windows_path(self):
        root = FakeItem("S", [KICK], uri="userfolder:C:\\Users\\me\\Samples")
        self.assertIs(find("C:\\Users\\me\\Samples\\kick.wav", [root])[0], KICK)

    def test_unc_path(self):
        root = FakeItem("S", [KICK], uri="userfolder:\\\\nas\\music\\Samples")
        self.assertIs(find("\\\\nas\\music\\Samples\\kick.wav", [root])[0], KICK)
        self.assertIs(find("//nas/music/Samples/kick.wav", [root])[0], KICK)
        with self.assertRaises(LookupError):
            find("\\\\nas\\other\\Samples\\kick.wav", [root])

    def test_unc_path_segments_start_at_the_server(self):
        self.assertEqual(
            browser._file_segments("\\\\nas\\music\\Pad.adv"),
            ["nas", "music", "Pad.adv"],
        )

    def test_prefix_of_a_folder_name_is_not_inside_it(self):
        root = FakeItem("Samples", [KICK], uri="userfolder:/a/Samples")
        with self.assertRaises(LookupError):
            find("/a/Samples2/kick.wav", [root])

    def test_the_root_itself_is_not_a_file_in_it(self):
        with self.assertRaises(LookupError):
            find("/Users/me/ProjectB/Samples", [MINE])

    def test_literal_percent_in_a_name(self):
        for folder in ("100% Pure", "A%41"):
            root = FakeItem("S", [KICK], uri="userfolder:/Users/me/" + folder)
            self.assertIs(find("/Users/me/%s/kick.wav" % folder, [root])[0], KICK)

    def test_hash_in_a_folder_name(self):
        root = FakeItem("Beats #1", [KICK], uri="userfolder:/Users/me/Beats #1")
        self.assertIs(find("/Users/me/Beats #1/kick.wav", [root])[0], KICK)

    def test_a_place_holding_the_user_library_still_gives_the_library(self):
        library = FakeItem("User Library", [FakeItem("kick.wav")])
        parent = FakeItem(
            "Ableton",
            [FakeItem("User Library", [FakeItem("kick.wav")])],
            uri="userfolder:/Users/me/Ableton",
        )
        with mock.patch.object(browser, "_USER_LIBRARY", "/Users/me/Ableton/User Library"):
            item, path = browser.find_file(
                fake_browser([parent], user_library=library),
                "/Users/me/Ableton/User Library/kick.wav",
            )
        self.assertIs(item, library.children[0])
        self.assertEqual(path, "User Library/kick.wav")

    def test_a_device_file_matches_its_name_without_the_extension(self):
        device = FakeItem("Producer_Pal")
        library = FakeItem("User Library", [FakeItem("Presets", [device])])
        with mock.patch.object(browser, "_USER_LIBRARY", "/Users/me/User Library"):
            item, _ = browser.find_file(
                fake_browser([], user_library=library),
                "/Users/me/User Library/Presets/Producer_Pal.amxd",
            )
        self.assertIs(item, device)

    def test_a_preset_named_with_its_extension_still_matches(self):
        preset = FakeItem("Bass.adv")
        place = FakeItem("Presets", [preset], uri="userfolder:/Users/me/Presets")
        self.assertIs(find("/Users/me/Presets/Bass.adv", [place])[0], preset)

    def test_symlinked_folder_or_file_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            real = os.path.join(tmp, "real", "Samples")
            os.makedirs(real)
            link = os.path.join(tmp, "link")
            os.symlink(os.path.join(tmp, "real"), link)
            by_link = FakeItem("Samples", [KICK], uri="userfolder:" + link + "/Samples")
            by_real = FakeItem("Samples", [KICK], uri="userfolder:" + real)
            self.assertIs(find(real + "/kick.wav", [by_link])[0], KICK)
            self.assertIs(find(link + "/Samples/kick.wav", [by_real])[0], KICK)

    def test_a_located_folder_is_not_name_matched(self):
        # A Places folder with a real path never falls back to its name.
        with self.assertRaises(LookupError):
            find("/Users/me/Elsewhere/Samples/kick.wav", [MINE, ELSEWHERE])


class NameMatchTest(unittest.TestCase):
    def test_pack_matches_by_name(self):
        pack = FakeItem("Drums", [PACK_KICK], uri="query:LivePacks#x/1")
        item, path = find("/Packs/Drums/kick.wav", [MINE], [pack])
        self.assertIs(item, PACK_KICK)
        self.assertEqual(path, "Packs/Drums/kick.wav")

    def test_two_packs_raise_naming_each_by_uri(self):
        with self.assertRaises(browser.AmbiguousFile) as caught:
            find("/x/Drums/kick.wav", [], two_packs())
        message = str(caught.exception)
        self.assertIn("query:LivePacks#x/1", message)
        self.assertIn("query:LivePacks#x/2", message)
        self.assertIn("unique name", message)

    def test_pack_and_name_fallback_place_raise(self):
        pack = FakeItem("Drums", [PACK_KICK], uri="query:LivePacks#x/1")
        place = FakeItem("Drums", [KICK], uri="somewhere:else")
        with self.assertRaises(browser.AmbiguousFile) as caught:
            find("/x/Drums/kick.wav", [place], [pack])
        message = str(caught.exception)
        self.assertIn("pack 'Drums' (query:LivePacks#x/1)", message)
        self.assertIn("Places folder 'Drums' (somewhere:else)", message)

    def test_a_located_place_beats_a_name_matched_pack(self):
        pack = FakeItem("Samples", [PACK_KICK], uri="query:LivePacks#x/1")
        item, path = find("/Users/me/ProjectB/Samples/kick.wav", [MINE], [pack])
        self.assertIs(item, KICK)
        self.assertEqual(path, "Places/Samples/kick.wav")

    def test_place_without_userfolder_uri_matches_by_name(self):
        place = FakeItem("Drums", [KICK], uri="somewhere:else")
        self.assertIs(find("/x/Drums/kick.wav", [place])[0], KICK)

    def test_place_without_uri_matches_by_name(self):
        place = FakeItem("Drums", [KICK])
        del place.uri
        self.assertIs(find("/x/Drums/kick.wav", [place])[0], KICK)


class RouteMappingTest(unittest.TestCase):
    def load(self, packs):
        bridge = types.SimpleNamespace(
            app=types.SimpleNamespace(browser=fake_browser([], packs))
        )
        params = {"type": "file", "path": "/x/Drums/kick.wav"}
        with self.assertRaises(RouteError) as caught:
            routes._find_item(bridge, params)
        return caught.exception

    def test_ambiguous_file_is_a_409_naming_the_candidates(self):
        err = self.load(two_packs())
        self.assertEqual(err.status, 409)
        message = err.payload["error"]
        self.assertIn("query:LivePacks#x/1", message)
        self.assertIn("query:LivePacks#x/2", message)

    def test_the_list_is_capped(self):
        message = self.load(two_packs(8)).payload["error"]
        self.assertIn("query:LivePacks#x/5", message)
        self.assertNotIn("query:LivePacks#x/6", message)
        self.assertIn("3 more", message)

    def test_unfound_file_is_a_404(self):
        self.assertEqual(self.load([]).status, 404)


if __name__ == "__main__":
    unittest.main()
