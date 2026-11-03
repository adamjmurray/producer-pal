# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""/device/basics with fake Live objects.

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


class FakeDevice:
    def __init__(self, name, is_active=True):
        self.name = name
        self.is_active = is_active


class UnreadableDevice:
    @property
    def name(self):
        raise RuntimeError("Live.Device.Device went away")


class FakeTrack:
    def __init__(self, devices):
        self.devices = devices


def ask(tracks, paths):
    bridge = types.SimpleNamespace(song=types.SimpleNamespace(tracks=tracks))
    return routes.ROUTES["/device/basics"](bridge, {"device_paths": paths})


class DeviceBasicsTest(unittest.TestCase):
    def test_is_registered_as_a_read_route(self):
        self.assertIn("/device/basics", routes.ROUTES)
        self.assertNotIn("/device/basics", routes.POST_ONLY)

    def test_answers_the_name_and_on_off_state(self):
        track = FakeTrack([FakeDevice("Mod Wheel Lane", False)])
        result = ask([track], ["live_set tracks 0 devices 0"])

        self.assertEqual(
            result, {"devices": [{"name": "Mod Wheel Lane", "is_active": False}]}
        )

    def test_answers_every_path_in_order(self):
        track = FakeTrack([FakeDevice("A"), FakeDevice("B", False)])
        paths = ["live_set tracks 0 devices 1", "live_set tracks 0 devices 0"]

        self.assertEqual(
            ask([track], paths),
            {
                "devices": [
                    {"name": "B", "is_active": False},
                    {"name": "A", "is_active": True},
                ]
            },
        )

    def test_a_path_that_names_nothing_is_an_error_in_its_own_entry(self):
        track = FakeTrack([FakeDevice("A")])
        result = ask(
            [track], ["live_set tracks 0 devices 3", "live_set tracks 0 devices 0"]
        )

        self.assertEqual(
            result["devices"][0], {"error": "device_path has nothing at devices 3"}
        )
        self.assertEqual(result["devices"][1], {"name": "A", "is_active": True})

    def test_a_device_live_cannot_read_is_an_error_in_its_own_entry(self):
        track = FakeTrack([UnreadableDevice()])
        result = ask([track], ["live_set tracks 0 devices 0"])

        self.assertEqual(result["devices"], [{"error": "Live couldn't read it"}])

    def test_refuses_a_request_without_paths(self):
        for params in ({}, {"device_paths": []}, {"device_paths": "live_set tracks 0"}):
            with self.assertRaises(routes.RouteError) as caught:
                routes.ROUTES["/device/basics"](types.SimpleNamespace(), params)

            self.assertEqual(caught.exception.status, 400)


if __name__ == "__main__":
    unittest.main()
