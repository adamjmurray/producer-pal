# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""find_file matching the real file name, with fake Live objects.

Live drops the extension from a Max device's name only; every item's `uri`
ends with the real file name. A file path must never load a sibling that just
shares its stem.

Run: PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s remote-script/tests
"""

import os
import sys
import types
import unittest
from urllib.parse import quote

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.modules.setdefault("Live", types.ModuleType("Live"))

from Producer_Pal import browser  # noqa: E402

PLACE = "/Users/me/Presets"


class FakeItem:
    def __init__(self, name, children=(), uri=None, device=False):
        self.name = name
        self.children = list(children)
        self.uri = uri
        self.is_loadable = not children
        self.is_device = device


def max_device(stem, uri_name=None, **kwargs):
    """A Max device: no extension in its name, the file name in its uri."""
    uri = None if uri_name is None else "query:Presets:Max:" + uri_name
    return FakeItem(stem, uri=uri, device=True, **kwargs)


def preset(name):
    return FakeItem(name, uri="query:Presets:Inst:" + name.replace(" ", "%20"))


def find(*items):
    place = FakeItem("Presets", list(items), uri="userfolder:" + PLACE)
    fake = types.SimpleNamespace(
        user_library=FakeItem("User Library", [FakeItem("-")]),
        packs=FakeItem("Packs", [FakeItem("-")]),
        user_folders=[place],
    )
    return lambda file_name: browser.find_file(fake, PLACE + "/" + file_name)


class MaxDeviceTest(unittest.TestCase):
    def test_amxd_path_finds_the_device(self):
        device = max_device("Producer_Pal", "Producer_Pal.amxd")
        item, path = find(device)("Producer_Pal.amxd")
        self.assertIs(item, device)
        self.assertEqual(path, "Places/Presets/Producer_Pal.amxd")

    def test_amxd_path_is_case_insensitive(self):
        device = max_device("Producer_Pal", "Producer_Pal.amxd")
        self.assertIs(find(device)("producer_pal.AMXD")[0], device)

    def test_amxd_picks_the_matching_device_among_siblings(self):
        other = max_device("Producer_Pal_2", "Producer_Pal_2.amxd")
        device = max_device("Producer_Pal", "Producer_Pal.amxd")
        self.assertIs(find(other, device)("Producer_Pal.amxd")[0], device)

    def test_spaces_percent_and_unicode_in_the_uri(self):
        for name in ("My Device.amxd", "100% Wet.amxd", "Tést テ.amxd"):
            device = max_device(name[: -len(".amxd")], quote(name))
            self.assertIs(find(device)(name)[0], device, name)

    def test_decomposed_accent_in_the_path(self):
        device = max_device("Tést", "T%C3%A9st.amxd")
        self.assertIs(find(device)("Tést.amxd")[0], device)

    def test_inside_a_folder(self):
        device = max_device("Dev", "Dev.amxd")
        folder = FakeItem("Max", [device], uri="query:Presets:Max")
        self.assertIs(find(folder)("Max/Dev.amxd")[0], device)


class RealUriShapesTest(unittest.TestCase):
    """The uris Live 12.4 gives, by where the item sits."""

    def test_top_level_item_in_a_place_ends_after_a_hash(self):
        device = max_device("Producer_Pal")
        device.uri = "userfolder:%s#Producer_Pal.amxd" % PLACE
        item, path = find(device)("Producer_Pal.amxd")
        self.assertIs(item, device)
        self.assertEqual(path, "Places/Presets/Producer_Pal.amxd")

    def test_nested_item_in_a_place(self):
        device = max_device("Dev")
        device.uri = "userfolder:%s/Max#Dev.amxd" % PLACE
        folder = FakeItem("Max", [device], uri="userfolder:%s#Max" % PLACE)
        self.assertIs(find(folder)("Max/Dev.amxd")[0], device)

    def test_place_uri_does_not_match_another_file(self):
        device = max_device("Producer_Pal")
        device.uri = "userfolder:%s#Producer_Pal.amxd" % PLACE
        with self.assertRaises(LookupError):
            find(device)("Producer_Pal.adv")

    def test_pack_item_keeps_a_literal_plus(self):
        leaf = FakeItem(
            "3 + 3.adg",
            uri="query:LivePacks#www.ableton.com/174:Arpeggios:3%20+%203.adg",
        )
        folder = FakeItem("Arpeggios", [leaf], uri="query:LivePacks#x:Arpeggios")
        self.assertIs(find_in_pack(folder, "Arpeggios/3 + 3.adg"), leaf)

    def test_top_level_pack_item(self):
        leaf = max_device("Foo")
        leaf.uri = "query:LivePacks#www.ableton.com/174:Foo.amxd"
        self.assertIs(find_in_pack(leaf, "Foo.amxd"), leaf)
        with self.assertRaises(LookupError):
            find_in_pack(leaf, "Foo.adv")


def find_in_pack(item, file_path):
    """The item find_file gives for a file in a pack, which it matches by name."""
    pack = FakeItem("Pack", [item], uri="query:LivePacks#www.ableton.com/174")
    fake = types.SimpleNamespace(
        user_library=FakeItem("User Library", [FakeItem("-")]),
        packs=FakeItem("Packs", [pack]),
        user_folders=[],
    )
    return browser.find_file(fake, "/Users/me/Pack/" + file_path)[0]


class WrongExtensionTest(unittest.TestCase):
    def test_adv_does_not_load_a_max_device_with_the_stem(self):
        with self.assertRaises(LookupError):
            find(max_device("Kit", "Kit.amxd"))("Kit.adv")

    def test_adg_does_not_load_an_adv_sibling(self):
        with self.assertRaises(LookupError):
            find(preset("Kit.adv"))("Kit.adg")

    def test_amxd_does_not_load_a_preset_with_the_stem(self):
        with self.assertRaises(LookupError):
            find(preset("Kit.adv"))("Kit.amxd")

    def test_amxd_does_not_load_a_folder_with_the_stem(self):
        folder = FakeItem("Kit", [FakeItem("x.adv")], uri="query:Presets:Kit")
        with self.assertRaises(LookupError):
            find(folder)("Kit.amxd")

    def test_adv_does_not_load_a_folder_with_the_stem(self):
        folder = FakeItem("Kit", [FakeItem("x.adv")], uri="query:Presets:Kit")
        with self.assertRaises(LookupError):
            find(folder)("Kit.adv")

    def test_adv_beside_a_max_device_finds_the_adv(self):
        wanted = preset("Kit.adv")
        self.assertIs(find(max_device("Kit", "Kit.amxd"), wanted)("Kit.adv")[0], wanted)

    def test_amxd_beside_an_adv_finds_the_device(self):
        device = max_device("Kit", "Kit.amxd")
        self.assertIs(find(preset("Kit.adv"), device)("Kit.amxd")[0], device)

    def test_suffix_alone_finds_nothing(self):
        for name in (".adv", ".adg", ".amxd"):
            with self.assertRaises(LookupError, msg=name):
                find(max_device("", ""), FakeItem("x.adv"))(name)


class NoUriTest(unittest.TestCase):
    def test_amxd_falls_back_to_the_stem_for_a_device(self):
        device = max_device("Dev")
        self.assertIs(find(device)("Dev.amxd")[0], device)

    def test_the_fallback_skips_non_devices(self):
        with self.assertRaises(LookupError):
            find(FakeItem("Dev"))("Dev.amxd")

    def test_the_fallback_is_for_amxd_only(self):
        with self.assertRaises(LookupError):
            find(max_device("Kit"))("Kit.adv")

    def test_a_device_with_a_uri_is_not_matched_by_stem(self):
        with self.assertRaises(LookupError):
            find(max_device("Dev", "Other.amxd"))("Dev.amxd")


class ExactNameTest(unittest.TestCase):
    def test_exact_name_still_wins(self):
        wanted = preset("serum with WT mapping.adg")
        self.assertIs(find(wanted)("serum with WT mapping.adg")[0], wanted)

    def test_plain_file_without_a_uri(self):
        wanted = FakeItem("kick.wav")
        self.assertIs(find(wanted)("kick.wav")[0], wanted)


if __name__ == "__main__":
    unittest.main()
