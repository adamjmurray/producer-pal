# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""/undo/undo and /undo/redo with a fake song.

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
from Producer_Pal.errors import RouteError  # noqa: E402
from Producer_Pal.producer_pal_device import count_producer_pal  # noqa: E402


def device(name, chains=()):
    return types.SimpleNamespace(name=name, chains=list(chains))


def track(*devices):
    return types.SimpleNamespace(devices=list(devices))


class FakeSong:
    """A song with `done` undoable steps and `undone` redoable ones.

    A step named in `inserts_pal` puts Producer Pal on the first track: undoing
    it removes the device, redoing it brings it back.
    """

    def __init__(self, done, undone=0, inserts_pal=()):
        self.done = list(range(done))
        self.undone = [100 + i for i in range(undone)]
        self.inserts_pal = set(inserts_pal)
        self.tracks = [track(device("Reverb"), device("Producer_Pal"))]
        self.return_tracks = []
        self.master_track = track()
        self.calls = []

    @property
    def can_undo(self):
        return len(self.done) > 0

    @property
    def can_redo(self):
        return len(self.undone) > 0

    def undo(self):
        self.calls.append("undo")
        step = self.done.pop()
        self.undone.append(step)
        if step in self.inserts_pal:
            self.tracks[0].devices = [
                d for d in self.tracks[0].devices if d.name != "Producer_Pal"
            ]

    def redo(self):
        self.calls.append("redo")
        step = self.undone.pop()
        self.done.append(step)
        if step in self.inserts_pal:
            self.tracks[0].devices.append(device("Producer_Pal"))


def bridge_for(song):
    return types.SimpleNamespace(song=song)


def call(route, song, bridge=None, **params):
    return routes.ROUTES[route](bridge or bridge_for(song), params)


class UndoTest(unittest.TestCase):
    def test_it_undoes_one_step_by_default_and_says_what_is_left(self):
        song = FakeSong(done=2)
        self.assertEqual(
            call("/undo/undo", song),
            {"done": 1, "can_undo": True, "can_redo": True},
        )
        self.assertEqual(song.calls, ["undo"])

    def test_it_reads_the_state_after_the_undo(self):
        song = FakeSong(done=1)
        self.assertEqual(
            call("/undo/undo", song),
            {"done": 1, "can_undo": False, "can_redo": True},
        )

    def test_it_undoes_as_many_steps_as_asked(self):
        song = FakeSong(done=5)
        result = call("/undo/undo", song, steps=3)
        self.assertEqual(result, {"done": 3, "can_undo": True, "can_redo": True})
        self.assertEqual(song.calls, ["undo"] * 3)

    def test_it_takes_steps_sent_as_text(self):
        song = FakeSong(done=5)
        self.assertEqual(call("/undo/undo", song, steps="2")["done"], 2)

    def test_it_stops_early_and_says_why_when_history_runs_out(self):
        song = FakeSong(done=2)
        self.assertEqual(
            call("/undo/undo", song, steps=5),
            {
                "done": 2,
                "can_undo": False,
                "can_redo": True,
                "stopped": "nothing more to undo",
            },
        )

    def test_it_refuses_with_a_409_and_does_not_undo_when_there_is_nothing(self):
        song = FakeSong(done=0, undone=1)
        with self.assertRaises(RouteError) as caught:
            call("/undo/undo", song, steps=3)
        self.assertEqual(caught.exception.status, 409)
        self.assertEqual(caught.exception.payload["error"], "nothing to undo")
        self.assertEqual(song.calls, [])

    def test_it_refuses_steps_out_of_range_without_clamping(self):
        for steps in (0, -1, 51, 2.5, "many", True):
            song = FakeSong(done=60)
            with self.assertRaises(RouteError) as caught:
                call("/undo/undo", song, steps=steps)
            self.assertEqual(caught.exception.status, 400, steps)
            self.assertEqual(song.calls, [], steps)

    def test_it_takes_the_most_steps_allowed(self):
        song = FakeSong(done=60)
        self.assertEqual(call("/undo/undo", song, steps=50)["done"], 50)


class RedoTest(unittest.TestCase):
    def test_it_redoes_one_step_and_says_what_is_left(self):
        song = FakeSong(done=0, undone=2)
        self.assertEqual(
            call("/undo/redo", song),
            {"done": 1, "can_undo": True, "can_redo": True},
        )
        self.assertEqual(song.calls, ["redo"])

    def test_it_redoes_as_many_steps_as_asked_and_stops_early(self):
        song = FakeSong(done=0, undone=2)
        result = call("/undo/redo", song, steps=4)
        self.assertEqual(result["done"], 2)
        self.assertEqual(result["stopped"], "nothing more to redo")
        self.assertFalse(result["can_redo"])

    def test_it_refuses_with_a_409_and_does_not_redo_when_there_is_nothing(self):
        song = FakeSong(done=3, undone=0)
        with self.assertRaises(RouteError) as caught:
            call("/undo/redo", song)
        self.assertEqual(caught.exception.status, 409)
        self.assertEqual(caught.exception.payload["error"], "nothing to redo")
        self.assertEqual(song.calls, [])


class ProducerPalGuardTest(unittest.TestCase):
    def test_it_counts_devices_holding_producer_pal_on_every_kind_of_track(self):
        rack = device("Rack", chains=[track(device("Producer_Pal"))])
        song = FakeSong(done=0)
        song.return_tracks = [track(rack)]
        song.master_track = track(device("producer_pal.amxd"))
        self.assertEqual(count_producer_pal(song), 3)

    def test_an_undo_that_would_remove_it_is_reversed_and_reported(self):
        # Steps are undone newest first: 0 is the oldest, and inserted Producer Pal.
        song = FakeSong(done=3, inserts_pal={0})
        bridge = bridge_for(song)
        result = call("/undo/undo", song, bridge, steps=5)
        self.assertEqual(result["done"], 2)
        self.assertIn("would remove Producer Pal", result["stopped"])
        self.assertIn("was stopped", result["stopped"])
        self.assertEqual(song.calls, ["undo", "undo", "undo", "redo"])
        self.assertEqual(count_producer_pal(song), 1)
        self.assertEqual(len(song.done), 1)

    def test_a_redo_that_would_remove_it_is_reversed_with_an_undo_and_reported(self):
        song = FakeSong(done=0, undone=1)
        song.tracks[0].devices = [device("Producer_Pal")]
        calls = []

        def redo_removing_it():
            calls.append("redo")
            song.undone.pop()
            song.done.append(0)
            song.tracks[0].devices = []

        def undo():
            calls.append("undo")
            song.done.pop()
            song.undone.append(0)
            song.tracks[0].devices = [device("Producer_Pal")]

        song.redo = redo_removing_it
        song.undo = undo
        result = call("/undo/redo", song)
        self.assertEqual(calls, ["redo", "undo"])
        self.assertEqual(result["done"], 0)
        self.assertIn("next redo would remove Producer Pal", result["stopped"])
        self.assertEqual(count_producer_pal(song), 1)

    def test_after_a_trip_the_next_step_that_way_is_refused_without_touching_live(self):
        song = FakeSong(done=1, inserts_pal={0})
        bridge = bridge_for(song)
        call("/undo/undo", song, bridge)
        song.calls.clear()
        with self.assertRaises(RouteError) as caught:
            call("/undo/undo", song, bridge)
        self.assertEqual(caught.exception.status, 409)
        self.assertEqual(
            caught.exception.payload["error"],
            "The next undo would remove Producer Pal from the Set, so it wasn't "
            "done. If the user wants that, or the next step is an edit of "
            "theirs, they can do it in Live.",
        )
        self.assertEqual(song.calls, [])

    def test_the_other_direction_is_still_allowed_and_clears_the_flag(self):
        song = FakeSong(done=2, undone=1, inserts_pal={0})
        bridge = bridge_for(song)
        self.assertEqual(call("/undo/undo", song, bridge, steps=2)["done"], 1)
        self.assertEqual(call("/undo/redo", song, bridge)["done"], 1)
        # The next undo is the step just redone, not the one that was unsafe.
        self.assertEqual(call("/undo/undo", song, bridge)["done"], 1)

    def test_the_flag_is_cleared_when_producer_pal_writes_again(self):
        song = FakeSong(done=2, inserts_pal={0})
        song.end_undo_step = lambda: None
        bridge = bridge_for(song)
        call("/undo/undo", song, bridge, steps=2)
        with self.assertRaises(RouteError):
            call("/undo/undo", song, bridge)
        call("/undo/end", song, bridge)
        # Allowed again (and trips again if it still would remove it).
        self.assertEqual(call("/undo/undo", song, bridge)["done"], 0)

    def test_a_new_bridge_for_another_set_starts_clear(self):
        song = FakeSong(done=1, inserts_pal={0})
        call("/undo/undo", song, bridge_for(song))
        other = FakeSong(done=1)
        self.assertEqual(call("/undo/undo", other, bridge_for(other))["done"], 1)


class RoutesTest(unittest.TestCase):
    def test_both_refuse_get(self):
        self.assertIn("/undo/undo", routes.POST_ONLY)
        self.assertIn("/undo/redo", routes.POST_ONLY)


if __name__ == "__main__":
    unittest.main()
