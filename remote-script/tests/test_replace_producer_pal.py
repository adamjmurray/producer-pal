# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""/replace-producer-pal with fake Live objects.

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

DEVICE_FILE = "/Users/me/Presets/Producer_Pal.amxd"
MAX_MIDI_EFFECT = 4


class FakeItem:
    def __init__(self, name, children=()):
        self.name = name
        self.children = list(children)
        self.is_loadable = not children
        self.is_device = False


class FakeDevice:
    def __init__(self, name, device_type=MAX_MIDI_EFFECT, chains=()):
        self.name = name
        self.type = device_type
        self.chains = list(chains)


class FakeChain:
    def __init__(self, devices):
        self.devices = devices


class FakeTrack:
    def __init__(self, name, devices):
        self.name = name
        self.devices = list(devices)


class FakeBrowser:
    """Replaces the hotswap target with the loaded item, the way Live does."""

    def __init__(self, tracks, file_name="Producer_Pal.amxd"):
        self.user_library = FakeItem("User Library", [FakeItem("-")])
        self.packs = FakeItem("Packs", [FakeItem("-")])
        self.user_folders = [FakeItem("Presets", [FakeItem(file_name)])]
        self.hotswap_target = None
        self.loads = 0
        self._tracks = tracks

    def load_item(self, item):
        self.loads += 1
        target = self.hotswap_target
        for track in self._tracks:
            if target in track.devices:
                new = FakeDevice(item.name.rsplit(".", 1)[0])
                track.devices[track.devices.index(target)] = new


def replace(
    tracks=(),
    return_tracks=(),
    master=None,
    file_name="Producer_Pal.amxd",
    params=None,
):
    """POST /replace-producer-pal for the file under a Places folder."""
    master = master or FakeTrack("Main", [])
    browser = FakeBrowser([*tracks, *return_tracks, master], file_name)
    bridge = types.SimpleNamespace(
        app=types.SimpleNamespace(browser=browser),
        song=types.SimpleNamespace(
            tracks=list(tracks),
            return_tracks=list(return_tracks),
            master_track=master,
        ),
    )
    params = {"path": "/Users/me/Presets/" + file_name} if params is None else params
    result = routes.ROUTES["/replace-producer-pal"](bridge, params)
    return result, browser


def refused(*args, **kwargs):
    """The RouteError the call raised."""
    try:
        replace(*args, **kwargs)
    except routes.RouteError as err:
        return err
    raise AssertionError("the call was not refused")


class ReplaceProducerPalTest(unittest.TestCase):
    def test_swaps_the_device_in_place_and_names_its_track(self):
        old = FakeDevice("Producer_Pal")
        tracks = [FakeTrack("0-MIDI", []), FakeTrack("1-MIDI", [FakeDevice("Eq"), old])]

        result, browser = replace(tracks)

        self.assertEqual(
            result,
            {
                "track": {"path": "t1", "name": "1-MIDI"},
                "device": {"name": "Producer_Pal"},
            },
        )
        self.assertIsNot(tracks[1].devices[1], old)
        self.assertEqual(tracks[1].devices[0].name, "Eq")
        self.assertEqual(browser.loads, 1)
        # Left on, Live would replace a device on the next ordinary load.
        self.assertIsNone(browser.hotswap_target)

    def test_finds_it_on_a_return_track_or_the_main_track(self):
        result, _ = replace(
            [FakeTrack("0-MIDI", [])],
            return_tracks=[FakeTrack("A Reverb", [FakeDevice("Producer_Pal")])],
        )
        self.assertEqual(result["track"], {"path": "rt0", "name": "A Reverb"})

        result, _ = replace(master=FakeTrack("Main", [FakeDevice("Producer_Pal")]))
        self.assertEqual(result["track"], {"path": "mt", "name": "Main"})

    def test_reports_the_swap_when_the_new_device_cant_be_read_back(self):
        tracks = [FakeTrack("0-MIDI", [FakeDevice("Producer_Pal")])]

        class Vanishing(FakeBrowser):
            def load_item(self, item):
                self._tracks[0].devices.clear()

        browser = Vanishing(tracks)
        bridge = types.SimpleNamespace(
            app=types.SimpleNamespace(browser=browser),
            song=types.SimpleNamespace(
                tracks=tracks, return_tracks=[], master_track=FakeTrack("Main", [])
            ),
        )

        result = routes.ROUTES["/replace-producer-pal"](bridge, {"path": DEVICE_FILE})

        self.assertEqual(result["device"], {"name": "Producer_Pal.amxd"})

    def test_refuses_a_set_without_producer_pal(self):
        error = refused([FakeTrack("0-MIDI", [FakeDevice("Eq")])])

        self.assertEqual(error.status, 409)
        self.assertIn("isn't in this Live Set", error.payload["error"])

    def test_does_not_look_inside_racks(self):
        rack = FakeDevice("Rack", chains=[FakeChain([FakeDevice("Producer_Pal")])])

        self.assertEqual(refused([FakeTrack("0-MIDI", [rack])]).status, 409)

    def test_refuses_two_and_swaps_neither(self):
        first, second = FakeDevice("Producer_Pal"), FakeDevice("Producer_Pal")
        tracks = [FakeTrack("0-MIDI", [first]), FakeTrack("1-MIDI", [second])]

        error = refused(tracks)

        self.assertEqual(error.status, 409)
        self.assertIn("2 times (t0, t1)", error.payload["error"])
        self.assertIs(tracks[0].devices[0], first)
        self.assertIs(tracks[1].devices[0], second)

    def test_refuses_a_file_that_is_not_producer_pal_before_touching_the_set(self):
        old = FakeDevice("Producer_Pal")
        tracks = [FakeTrack("0-MIDI", [old])]

        error = refused(tracks, file_name="Other Device.amxd")

        self.assertEqual(error.status, 409)
        self.assertIn("isn't the Producer Pal device", error.payload["error"])
        self.assertIs(tracks[0].devices[0], old)

    def test_a_file_the_browser_lacks_is_a_404(self):
        error = refused(
            [FakeTrack("0-MIDI", [FakeDevice("Producer_Pal")])],
            params={"path": "/Users/me/Elsewhere/Producer_Pal.amxd"},
        )

        self.assertEqual(error.status, 404)

    def test_needs_a_path(self):
        error = refused([FakeTrack("0-MIDI", [FakeDevice("Producer_Pal")])], params={})

        self.assertEqual(error.status, 400)

    def test_ignores_a_type_param_and_always_takes_a_file(self):
        result, _ = replace(
            [FakeTrack("0-MIDI", [FakeDevice("Producer_Pal")])],
            params={"type": "plugin", "path": DEVICE_FILE},
        )

        self.assertEqual(result["track"]["path"], "t0")

    def test_is_a_post_only_route(self):
        self.assertIn("/replace-producer-pal", routes.POST_ONLY)


class LoadStillRefusesASecondProducerPalTest(unittest.TestCase):
    def test_names_the_track_that_has_it(self):
        song = types.SimpleNamespace(
            tracks=[FakeTrack("0-MIDI", []), FakeTrack("Pal", [FakeDevice("producer_pal.amxd")])],
            return_tracks=[],
            master_track=FakeTrack("Main", []),
        )

        with self.assertRaises(routes.RouteError) as caught:
            routes._refuse_second_producer_pal(song)

        self.assertEqual(caught.exception.status, 409)
        self.assertIn("on t1 'Pal'", caught.exception.payload["error"])

    def test_passes_a_set_without_it(self):
        song = types.SimpleNamespace(
            tracks=[FakeTrack("0-MIDI", [FakeDevice("Eq")])],
            return_tracks=[],
            master_track=FakeTrack("Main", []),
        )

        routes._refuse_second_producer_pal(song)


if __name__ == "__main__":
    unittest.main()
