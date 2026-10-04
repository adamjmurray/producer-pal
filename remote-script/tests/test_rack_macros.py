# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: GPL-3.0-or-later

"""/device/macros with fake Live objects.

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


def flags(*mapped):
    """The 16 bools Live reports, true at each 1-based macro number."""
    return tuple(number in mapped for number in range(1, 17))


class FakeDevice:
    def __init__(self, name):
        self.name = name


class FakeRack(FakeDevice):
    def __init__(self, name, mapped=(), chains=()):
        super().__init__(name)
        self.macros_mapped = flags(*mapped)
        self.chains = list(chains)


class FakeChain:
    def __init__(self, devices):
        self.devices = devices


class FakeTrack:
    def __init__(self, devices):
        self.devices = devices


def ask(tracks, paths):
    bridge = types.SimpleNamespace(song=types.SimpleNamespace(tracks=tracks))
    return routes.ROUTES["/device/macros"](bridge, {"device_paths": paths})


class RackMacrosTest(unittest.TestCase):
    def test_is_registered_as_a_read_route(self):
        self.assertIn("/device/macros", routes.ROUTES)
        self.assertNotIn("/device/macros", routes.POST_ONLY)

    def test_numbers_the_mapped_macros_from_one(self):
        rack = FakeRack("Rack", mapped=(1, 7, 16))
        result = ask([FakeTrack([rack])], ["live_set tracks 0 devices 0"])

        self.assertEqual(result, {"racks": [{"mapped": [1, 7, 16]}]})

    def test_a_rack_with_nothing_mapped_has_an_empty_list(self):
        result = ask([FakeTrack([FakeRack("Rack")])], ["live_set tracks 0 devices 0"])

        self.assertEqual(result, {"racks": [{"mapped": []}]})

    def test_reaches_a_rack_inside_a_chain(self):
        inner = FakeRack("Amp and Cab", mapped=(7,))
        outer = FakeRack("E-Piano", chains=[FakeChain([FakeDevice("x"), inner])])
        path = "live_set tracks 0 devices 0 chains 0 devices 1"

        self.assertEqual(ask([FakeTrack([outer])], [path]), {"racks": [{"mapped": [7]}]})

    def test_answers_every_path_in_order(self):
        track = FakeTrack([FakeRack("A", mapped=(2,)), FakeRack("B", mapped=(3, 4))])
        paths = ["live_set tracks 0 devices 1", "live_set tracks 0 devices 0"]

        self.assertEqual(
            ask([track], paths),
            {"racks": [{"mapped": [3, 4]}, {"mapped": [2]}]},
        )

    def test_a_device_that_is_not_a_rack_is_an_error_in_its_own_entry(self):
        track = FakeTrack([FakeDevice("Reverb"), FakeRack("Rack", mapped=(1,))])
        result = ask(
            [track], ["live_set tracks 0 devices 0", "live_set tracks 0 devices 1"]
        )

        self.assertEqual(result["racks"][0], {"error": "'Reverb' is not a rack"})
        self.assertEqual(result["racks"][1], {"mapped": [1]})

    def test_a_path_that_names_nothing_is_an_error_in_its_own_entry(self):
        result = ask([FakeTrack([])], ["live_set tracks 0 devices 3"])

        self.assertEqual(
            result["racks"], [{"error": "device_path has nothing at devices 3"}]
        )

    def test_refuses_a_request_without_paths(self):
        for params in ({}, {"device_paths": []}, {"device_paths": "live_set tracks 0"}):
            with self.assertRaises(routes.RouteError) as caught:
                routes.ROUTES["/device/macros"](types.SimpleNamespace(), params)

            self.assertEqual(caught.exception.status, 400)

    def test_refuses_a_runaway_list(self):
        paths = ["live_set tracks 0 devices 0"] * 201

        with self.assertRaises(routes.RouteError) as caught:
            ask([FakeTrack([FakeRack("Rack")])], paths)

        self.assertEqual(caught.exception.status, 400)


if __name__ == "__main__":
    unittest.main()
