# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""/device/duplicate with fake Live objects.

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


class FakeDevice:
    def __init__(self, name, device_type=AUDIO_EFFECT, chains=()):
        self.name = name
        self.type = device_type
        self.chains = list(chains)


class FakeHolder:
    """A track, chain or drum chain: Live puts a copy right after the original."""

    def __init__(self, devices=(), refuses=None):
        self.devices = list(devices)
        self.refuses = refuses
        self.calls = []

    def duplicate_device(self, index):
        self.calls.append(index)
        if self.refuses is not None:
            raise RuntimeError(self.refuses)
        original = self.devices[index]
        copy = FakeDevice(original.name, original.type, original.chains)
        self.devices.insert(index + 1, copy)


class FakeChain(FakeHolder):
    pass


def duplicate(song, params):
    bridge = types.SimpleNamespace(song=song)
    return routes.ROUTES["/device/duplicate"](bridge, params)


def song_with(*tracks):
    return types.SimpleNamespace(
        tracks=list(tracks), return_tracks=[], master_track=None
    )


class DuplicateDeviceTest(unittest.TestCase):
    def test_is_registered_as_a_change(self):
        self.assertIn("/device/duplicate", routes.ROUTES)
        self.assertIn("/device/duplicate", routes.POST_ONLY)

    def test_copies_a_device_on_a_track(self):
        track = FakeHolder([FakeDevice("EQ"), FakeDevice("Reverb")])
        result = duplicate(
            song_with(track), {"device_path": "live_set tracks 0 devices 1"}
        )

        self.assertEqual(result, {"device": {"name": "Reverb", "index": 2}})
        self.assertEqual(track.calls, [1])
        self.assertEqual([d.name for d in track.devices], ["EQ", "Reverb", "Reverb"])

    def test_copies_a_device_inside_a_rack_chain(self):
        chain = FakeChain([FakeDevice("Delay")])
        rack = FakeDevice("Rack", chains=[chain])
        track = FakeHolder([rack])
        result = duplicate(
            song_with(track),
            {"device_path": "live_set tracks 0 devices 0 chains 0 devices 0"},
        )

        self.assertEqual(result["device"]["index"], 1)
        self.assertEqual(chain.calls, [0])
        self.assertEqual(track.calls, [])

    def test_copies_a_rack_with_what_is_inside_it(self):
        inner = FakeDevice("Delay")
        track = FakeHolder([FakeDevice("Rack", chains=[FakeChain([inner])])])
        duplicate(song_with(track), {"device_path": "live_set tracks 0 devices 0"})

        self.assertEqual(track.calls, [0])
        self.assertIs(track.devices[1].chains[0].devices[0], inner)

    def test_refuses_an_instrument_without_asking_live(self):
        track = FakeHolder([FakeDevice("Drift", INSTRUMENT)])

        with self.assertRaises(routes.RouteError) as caught:
            duplicate(song_with(track), {"device_path": "live_set tracks 0 devices 0"})

        self.assertEqual(caught.exception.status, 409)
        self.assertIn("instrument", caught.exception.payload["error"])
        self.assertEqual(track.calls, [])

    def test_words_a_refusal_from_live_as_a_409(self):
        track = FakeHolder(
            [FakeDevice("Reverb")], refuses="Can not duplicate instrument."
        )

        with self.assertRaises(routes.RouteError) as caught:
            duplicate(song_with(track), {"device_path": "live_set tracks 0 devices 0"})

        self.assertEqual(caught.exception.status, 409)
        self.assertEqual(
            caught.exception.payload["error"], "Can not duplicate instrument."
        )

    def test_refuses_the_producer_pal_device(self):
        track = FakeHolder([FakeDevice("Producer_Pal.amxd")])

        with self.assertRaises(routes.RouteError) as caught:
            duplicate(song_with(track), {"device_path": "live_set tracks 0 devices 0"})

        self.assertEqual(caught.exception.status, 409)
        self.assertEqual(track.calls, [])

    def test_refuses_a_rack_holding_the_producer_pal_device(self):
        rack = FakeDevice("Rack", chains=[FakeChain([FakeDevice("Producer_Pal")])])
        track = FakeHolder([rack])

        with self.assertRaises(routes.RouteError) as caught:
            duplicate(song_with(track), {"device_path": "live_set tracks 0 devices 0"})

        self.assertEqual(caught.exception.status, 409)
        self.assertEqual(track.calls, [])

    def test_refuses_a_device_that_is_no_longer_the_one_named(self):
        track = FakeHolder([FakeDevice("EQ"), FakeDevice("Reverb")])

        with self.assertRaises(routes.RouteError) as caught:
            duplicate(
                song_with(track),
                {"device_path": "live_set tracks 0 devices 0", "device_name": "Reverb"},
            )

        self.assertEqual(caught.exception.status, 409)
        self.assertIn("now 'EQ'", caught.exception.payload["error"])
        self.assertEqual(track.calls, [])

    def test_takes_the_device_when_its_name_matches(self):
        track = FakeHolder([FakeDevice("EQ")])
        duplicate(
            song_with(track),
            {"device_path": "live_set tracks 0 devices 0", "device_name": "EQ"},
        )

        self.assertEqual(track.calls, [0])

    def test_refuses_a_path_that_names_no_device(self):
        track = FakeHolder([FakeDevice("EQ")])

        with self.assertRaises(routes.RouteError) as caught:
            duplicate(song_with(track), {"device_path": "live_set tracks 0 devices 4"})

        self.assertEqual(caught.exception.status, 400)

    def test_refuses_a_path_that_does_not_end_in_a_device(self):
        with self.assertRaises(routes.RouteError) as caught:
            duplicate(song_with(FakeHolder()), {"device_path": "live_set tracks 0"})

        self.assertEqual(caught.exception.status, 400)


if __name__ == "__main__":
    unittest.main()
