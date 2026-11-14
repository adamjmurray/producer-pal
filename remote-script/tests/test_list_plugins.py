# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""/list for plug-ins, which Live doesn't flag as devices, with fake Live objects.

Run: PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s remote-script/tests
"""

import os
import sys
import types
import unittest

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.modules.setdefault("Live", types.ModuleType("Live"))

from Producer_Pal import browser, routes  # noqa: E402


class FakeItem:
    def __init__(self, name, children=(), loadable=None, device=False):
        self.name = name
        self.children = list(children)
        self.is_loadable = (not children) if loadable is None else loadable
        self.is_device = device


def plugin(name, presets=()):
    """A plug-in is loadable and holds its presets, which are loadable too."""
    return FakeItem(name, [FakeItem(p) for p in presets], loadable=True)


PLUGINS = FakeItem(
    "Plug-Ins",
    [
        FakeItem(
            "VST3",
            [
                FakeItem(
                    "Valhalla DSP",
                    [
                        plugin("ValhallaRoom", ["Big Hall", "Small Room"]),
                        plugin("ValhallaShimmer"),
                    ],
                ),
                FakeItem("FabFilter", [plugin("Pro-Q 4", ["Default"])]),
            ],
        ),
        FakeItem("AU", [FakeItem("Apple", [plugin("AUDelay", ["Echo"])])]),
    ],
)

ALL = [
    "VST3/Valhalla DSP/ValhallaRoom",
    "VST3/Valhalla DSP/ValhallaRoom/Big Hall",
    "VST3/Valhalla DSP/ValhallaRoom/Small Room",
    "VST3/Valhalla DSP/ValhallaShimmer",
    "VST3/FabFilter/Pro-Q 4",
    "VST3/FabFilter/Pro-Q 4/Default",
    "AU/Apple/AUDelay",
    "AU/Apple/AUDelay/Echo",
]

PLUG_INS_ONLY = [
    "VST3/Valhalla DSP/ValhallaRoom",
    "VST3/Valhalla DSP/ValhallaShimmer",
    "VST3/FabFilter/Pro-Q 4",
    "AU/Apple/AUDelay",
]


def bridge():
    app = types.SimpleNamespace(browser=types.SimpleNamespace(plugins=PLUGINS))
    return types.SimpleNamespace(app=app)


def listed(params):
    reply = routes.list_items(bridge(), dict(type="plugin", **params))
    return reply, [item["path"] for item in reply["items"]]


class ListPluginsTest(unittest.TestCase):
    def test_walks_into_plugins_by_default(self):
        reply, paths = listed({})
        self.assertEqual(paths, ALL)
        self.assertNotIn("plugins_only", reply)

    def test_plugins_only_stops_at_each_plugin(self):
        reply, paths = listed({"plugins_only": "true"})
        self.assertEqual(paths, PLUG_INS_ONLY)
        self.assertEqual(reply["count"], len(PLUG_INS_ONLY))
        self.assertIs(reply["plugins_only"], True)

    def test_plugins_only_still_filters_by_query(self):
        _, paths = listed({"plugins_only": "true", "q": "valhalla"})
        self.assertEqual(
            paths,
            ["VST3/Valhalla DSP/ValhallaRoom", "VST3/Valhalla DSP/ValhallaShimmer"],
        )

    def test_plugins_only_names_are_the_plugins(self):
        reply, _ = listed({"plugins_only": "1"})
        self.assertEqual(reply["items"][0]["name"], "ValhallaRoom")

    def test_plugins_only_is_ignored_for_the_other_listings(self):
        _, one_level = listed({"recursive": "false", "plugins_only": "true"})
        self.assertEqual(one_level, ["VST3", "AU"])
        reply, presets = listed({"presets": "true", "plugins_only": "true"})
        self.assertEqual(presets, listed({"presets": "true"})[1])
        self.assertNotIn("plugins_only", reply)


class WalkTest(unittest.TestCase):
    def test_device_sections_walk_as_before(self):
        device = FakeItem("Operator", [FakeItem("Pad")], loadable=True, device=True)
        root = FakeItem("Instruments", [FakeItem("Folder", [device])])

        for stop in (False, True):
            found = browser.list_loadable(root, "", True, stop_at_loadable=stop)
            self.assertEqual([i["path"] for i in found], ["Folder/Operator"])

    def test_match_items_still_finds_presets_in_plugins(self):
        found = browser.match_items(PLUGINS, "Big Hall", False)
        self.assertEqual([path for _, path in found], [ALL[1]])


if __name__ == "__main__":
    unittest.main()
