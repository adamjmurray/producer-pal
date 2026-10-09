# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""/hotswap with fake Live objects.

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

INSTRUMENT = 1
AUDIO_EFFECT = 2


class FakeItem:
    def __init__(self, name, children=(), device_type=None):
        self.name = name
        self.children = list(children)
        self.is_loadable = not children
        self.is_device = False
        # The kind of device this preset is for (a file's is never known).
        self.device_type = device_type


class FakeDevice:
    def __init__(self, name, device_type):
        self.name = name
        self.type = device_type


class FakeBrowser:
    """Loads a preset the way Live's hotswap does."""

    def __init__(self, folder):
        self.user_library = FakeItem("User Library", [FakeItem("-")])
        self.packs = FakeItem("Packs", [FakeItem("-")])
        self.user_folders = [folder]
        self.hotswap_target = None

    def load_item(self, item):
        device = self.hotswap_target
        # A preset for another kind of device loads nothing. One for the same
        # kind keeps the device and names it after the preset.
        if device is not None and item.device_type == device.type:
            device.name = item.name.rsplit(".", 1)[0]


class FakeTrack:
    def __init__(self, devices):
        self.devices = devices


class FakeRack:
    def __init__(self, chains):
        self.chains = chains


class FakeChain:
    def __init__(self, devices):
        self.devices = devices


def hotswap(
    device,
    preset_file,
    device_type,
    device_path="live_set tracks 0 devices 0",
    song=None,
):
    """POST /hotswap of a preset file under a Places folder onto `device`.

    `song` holds the fake Song's attributes; the default is one track with
    `device` on it.
    """
    browser = FakeBrowser(
        FakeItem("Presets", [FakeItem(preset_file, device_type=device_type)])
    )
    bridge = types.SimpleNamespace(
        app=types.SimpleNamespace(browser=browser),
        song=types.SimpleNamespace(**(song or {"tracks": [FakeTrack([device])]})),
    )
    return routes.hotswap_device(
        bridge,
        {
            "type": "file",
            "path": "/Users/me/Presets/" + preset_file,
            "device_path": device_path,
        },
    )


class HotswapFileTest(unittest.TestCase):
    def test_loads_a_preset_file_onto_its_device(self):
        device = FakeDevice("Wavetable", INSTRUMENT)
        result = hotswap(device, "Abdominal Bass.adv", INSTRUMENT)

        self.assertEqual(
            result["device"], {"name": "Abdominal Bass", "replaced": False}
        )

    def test_reloads_the_preset_a_device_is_already_named_for(self):
        device = FakeDevice("Abdominal Bass", INSTRUMENT)
        result = hotswap(device, "Abdominal Bass.adv", INSTRUMENT)

        self.assertEqual(
            result["device"], {"name": "Abdominal Bass", "replaced": False}
        )

    def test_refuses_a_preset_file_for_another_kind_of_device(self):
        device = FakeDevice("Drift", INSTRUMENT)

        with self.assertRaises(routes.RouteError) as caught:
            hotswap(device, "Big Hall.adv", AUDIO_EFFECT)

        self.assertEqual(caught.exception.status, 409)
        self.assertIn("Live didn't load", caught.exception.payload["error"])
        self.assertEqual(device.name, "Drift")


class HotswapDevicePathTest(unittest.TestCase):
    def assert_bad_path(self, device_path, message):
        device = FakeDevice("Drift", INSTRUMENT)

        with self.assertRaises(routes.RouteError) as caught:
            hotswap(device, "Big Hall.adv", INSTRUMENT, device_path)

        self.assertEqual(caught.exception.status, 400)
        self.assertIn(message, caught.exception.payload["error"])
        self.assertEqual(device.name, "Drift")

    def test_refuses_a_path_that_starts_at_devices(self):
        self.assert_bad_path("devices 0", "must start with one of")
        self.assert_bad_path("live_set devices 0", "must start with one of")

    def test_refuses_a_path_that_starts_anywhere_else(self):
        self.assert_bad_path("live_set chains 0 devices 0", "must start with one of")

    def test_refuses_a_path_that_does_not_end_at_a_device(self):
        self.assert_bad_path("live_set tracks 0", "must end in")

    def test_refuses_a_word_the_object_does_not_have(self):
        self.assert_bad_path(
            "live_set tracks 0 devices 0 chains 0 devices 0", "nothing at 'chains'"
        )

    def test_loads_onto_a_return_track_master_track_or_rack_chain_device(self):
        def song_with(device):
            return {
                "live_set return_tracks 1 devices 0": dict(
                    tracks=[], return_tracks=[FakeTrack([]), FakeTrack([device])]
                ),
                "live_set master_track devices 0": dict(
                    tracks=[], master_track=FakeTrack([device])
                ),
                "live_set tracks 0 devices 0 chains 1 devices 0": dict(
                    tracks=[
                        FakeTrack([FakeRack([FakeChain([]), FakeChain([device])])])
                    ]
                ),
            }

        for device_path in song_with(None):
            device = FakeDevice("Wavetable", INSTRUMENT)
            result = hotswap(
                device,
                "Abdominal Bass.adv",
                INSTRUMENT,
                device_path,
                song_with(device)[device_path],
            )

            self.assertEqual(
                result["device"],
                {"name": "Abdominal Bass", "replaced": False},
                device_path,
            )

    def test_accepts_a_path_without_live_set(self):
        device = FakeDevice("Wavetable", INSTRUMENT)
        result = hotswap(
            device, "Abdominal Bass.adv", INSTRUMENT, "tracks 0 devices 0"
        )

        self.assertEqual(result["device"]["name"], "Abdominal Bass")


if __name__ == "__main__":
    unittest.main()
