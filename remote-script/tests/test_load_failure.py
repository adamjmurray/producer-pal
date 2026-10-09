# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""/load and /hotswap when Live throws after changing the Set.

Run: PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s remote-script/tests
"""

import os
import sys
import unittest
from unittest import mock

# Keep __pycache__ out of the checkout.
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from test_preset_guard import (  # noqa: E402
    FakeBrowser,
    FakeDevice,
    FakeHolder,
    FakeSong,
    hotswap,
    load,
)
from Producer_Pal import routes  # noqa: E402


def raising(message="Live said no"):
    def on_load(_target):
        raise RuntimeError(message)

    return on_load


class LoadFailureTest(unittest.TestCase):
    def test_removes_the_track_it_made_when_the_load_throws(self):
        song = FakeSong([FakeHolder([FakeDevice("Mine")])])

        with self.assertRaises(routes.RouteError) as caught:
            load(song, FakeBrowser(raising()), params={"track_type": "midi"})

        self.assertEqual(caught.exception.status, 500)
        self.assertIs(caught.exception.payload["changed"], False)
        self.assertIn("RuntimeError: Live said no", caught.exception.payload["error"])
        self.assertIn("the new track was removed", caught.exception.payload["error"])
        self.assertEqual([t.name for t in song.tracks], ["Track"])
        self.assertEqual([t.name for t in song.deleted_tracks], ["New"])

    def test_keeps_the_track_when_the_device_landed_and_the_reply_fails(self):
        class Unreadable(FakeHolder):
            @property
            def name(self):
                raise RuntimeError("name unreadable")

            @name.setter
            def name(self, value):
                pass

        track = Unreadable()
        song = FakeSong([])
        song.create_midi_track = lambda index: song.tracks.append(track) or track
        browser = FakeBrowser(lambda _: track.devices.append(FakeDevice("Pal")))

        with self.assertRaises(routes.RouteError) as caught:
            load(song, browser, params={"track_type": "midi"})

        self.assertEqual(caught.exception.status, 500)
        self.assertIs(caught.exception.payload["changed"], True)
        self.assertIn("was loaded onto the new track", caught.exception.payload["error"])
        self.assertEqual(song.tracks, [track])
        self.assertEqual(song.deleted_tracks, [])

    def test_keeps_the_track_when_the_load_throws_after_a_device_landed(self):
        track = FakeHolder()
        song = FakeSong([])
        song.create_midi_track = lambda index: song.tracks.append(track) or track

        def on_load(_target):
            track.devices.append(FakeDevice("Half"))
            raise RuntimeError("late failure")

        with self.assertRaises(routes.RouteError) as caught:
            load(song, FakeBrowser(on_load), params={"track_type": "midi"})

        self.assertIs(caught.exception.payload["changed"], True)
        self.assertEqual(song.tracks, [track])

    def test_keeps_the_track_when_its_devices_cannot_be_read(self):
        class Opaque(FakeHolder):
            @property
            def devices(self):
                if self.__dict__.get("armed"):
                    raise RuntimeError("devices unreadable")
                return []

            @devices.setter
            def devices(self, value):
                pass

        track = Opaque()
        song = FakeSong([])
        song.create_midi_track = lambda index: song.tracks.append(track) or track

        with self.assertRaises(routes.RouteError) as caught:
            load(song, FakeBrowser(lambda _: track.__dict__.update(armed=True)),
                 params={"track_type": "midi"})

        self.assertIs(caught.exception.payload["changed"], True)
        self.assertEqual(song.tracks, [track])

    def test_says_so_when_the_track_cannot_be_removed(self):
        song = FakeSong([])
        song.delete_track = mock.Mock(side_effect=RuntimeError("no"))

        with self.assertRaises(routes.RouteError) as caught:
            load(song, FakeBrowser(raising()), params={"track_type": "midi"})

        message = caught.exception.payload["error"]
        self.assertEqual(caught.exception.status, 500)
        self.assertIs(caught.exception.payload["changed"], True)
        self.assertIn("the new track couldn't be removed (no)", message)
        self.assertIn("delete it by hand", message)

    def test_leaves_a_track_the_caller_named_alone(self):
        song = FakeSong([FakeHolder([])])

        with self.assertRaises(RuntimeError):
            load(song, FakeBrowser(raising()), params={"track_index": 0})

        self.assertEqual(len(song.tracks), 1)
        self.assertEqual(song.deleted_tracks, [])


class HotswapReadBackTest(unittest.TestCase):
    def test_reports_the_swap_when_the_slot_cannot_be_read_back(self):
        track = FakeHolder([FakeDevice("Reverb")])
        browser = FakeBrowser(lambda _: track.devices.clear())

        with self.assertRaises(routes.RouteError) as caught:
            hotswap(FakeSong([track]), browser)

        self.assertEqual(caught.exception.status, 500)
        self.assertIs(caught.exception.payload["changed"], True)
        self.assertIn("couldn't be read back", caught.exception.payload["error"])


if __name__ == "__main__":
    unittest.main()
