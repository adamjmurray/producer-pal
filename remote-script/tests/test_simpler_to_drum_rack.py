# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""/device/simpler/to-drum-rack with fake Live objects.

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

import Live  # noqa: E402
from Producer_Pal import routes  # noqa: E402

ROUTE = "/device/simpler/to-drum-rack"
PATH = "live_set tracks 0 devices 0"


class FakeSimpler:
    name = "Loop"
    class_name = "OriginalSimpler"

    def __init__(self, playback_mode=2):
        self.playback_mode = playback_mode


class FakeRack:
    name = "Loop"
    class_name = "DrumGroupDevice"

    def __init__(self, pads):
        self.chains = [object()] * pads


class FakeTrack:
    def __init__(self, devices):
        self.devices = devices


class FakeConversions:
    """Swaps the Simpler for a rack in place, as Live does."""

    def __init__(self, track, pads=8, refuses=None, leaves=False):
        self.track = track
        self.pads = pads
        self.refuses = refuses
        self.leaves = leaves
        self.calls = []

    def sliced_simpler_to_drum_rack(self, song, simpler):
        if self.refuses is not None:
            raise RuntimeError(self.refuses)
        self.calls.append(simpler)
        self.track.devices = [] if self.leaves else [FakeRack(self.pads)]


class ToDrumRackTest(unittest.TestCase):
    def setUp(self):
        self.simpler = FakeSimpler()
        self.track = FakeTrack([self.simpler])
        self.install(FakeConversions(self.track))

    def install(self, conversions):
        self.conversions = conversions
        Live.Conversions = conversions
        self.addCleanup(lambda: vars(Live).pop("Conversions", None))

    def convert(self, path=PATH):
        bridge = types.SimpleNamespace(song=types.SimpleNamespace(tracks=[self.track]))
        return routes.ROUTES[ROUTE](bridge, {"device_path": path})

    def refused(self, status):
        with self.assertRaises(routes.RouteError) as caught:
            self.convert()
        self.assertEqual(caught.exception.status, status)
        return str(caught.exception)

    def test_is_a_write_route(self):
        self.assertIn(ROUTE, routes.POST_ONLY)

    def test_converts_and_counts_the_pads(self):
        self.assertEqual(self.convert(), {"pads": 8})
        self.assertEqual(self.conversions.calls, [self.simpler])

    def test_refuses_a_simpler_that_is_not_slicing_without_asking_live(self):
        self.simpler.playback_mode = 1

        self.assertEqual(self.refused(409), "the Simpler isn't in slicing mode")
        self.assertEqual(self.conversions.calls, [])

    def test_refuses_a_device_that_is_not_a_simpler(self):
        self.track.devices = [FakeRack(2)]

        self.assertEqual(self.refused(400), "'Loop' is not a Simpler")

    def test_an_older_live_without_the_conversion_is_a_409(self):
        del Live.Conversions

        self.assertEqual(
            self.refused(409), "this Live version can't convert a Simpler's slices"
        )

    def test_passes_on_what_live_refuses_with(self):
        self.install(FakeConversions(self.track, refuses="Can only convert if sliced"))

        self.assertEqual(
            self.refused(409), "Live refused the conversion: Can only convert if sliced"
        )

    def test_says_so_when_the_rack_cant_be_read_back(self):
        self.install(FakeConversions(self.track, leaves=True))

        self.assertEqual(
            self.refused(500), "converted, but Live couldn't read the Drum Rack back"
        )


if __name__ == "__main__":
    unittest.main()
