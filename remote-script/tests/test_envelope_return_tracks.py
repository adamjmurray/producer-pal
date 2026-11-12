# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""A Live 13 return track's envelope clips are addressed `rt0` beside `slot`,
and every envelope route reaches the return's own mixer and devices.

Run: PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s remote-script/tests
"""

import os
import sys
import types
import unittest

# Keep __pycache__ out of the checkout.
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# Only Live's own Python has these modules; the package imports them on load.
_live = sys.modules.setdefault("Live", types.ModuleType("Live"))
_live_envelope = types.ModuleType("Live.Envelope")
_live_envelope.EnvelopeEvent = lambda *args: args
_live_envelope.EnvelopeEventControlCoefficients = lambda *args: args
sys.modules["Live.Envelope"] = _live_envelope
_live.Envelope = _live_envelope

from Producer_Pal import clip_address, routes  # noqa: E402
from Producer_Pal.errors import RouteError  # noqa: E402


class FakeParam:
    min = 0.0
    max = 1.0
    value = 0.5
    is_quantized = False
    is_enabled = True
    automation_state = 0

    def __init__(self, name):
        self.name = name

    def str_for_value(self, value):
        return "%s" % value

    def re_enable_automation(self):
        pass


class FakeEvent:
    def __init__(self, time):
        self.time = time
        self.value = 0.5
        self.control_coefficients = types.SimpleNamespace(x1=0.5, y1=0.5, x2=0.5, y2=0.5)


class FakeEnvelope:
    def __init__(self):
        self.events = []

    def events_in_range(self, start, end):
        return [FakeEvent(t) for t in (0.0, 1.0)]

    def create_event(self, event):
        self.events.append(event)

    def value_at_time(self, time):
        return 0.5


class FakeClip:
    """An empty clip, or one that holds an envelope on `param`."""

    def __init__(self, param=None):
        self.param = param
        self.has_envelopes = param is not None
        self.created = None

    def automation_envelope(self, param):
        return FakeEnvelope() if param is self.param else None

    def create_automation_envelope(self, param):
        self.param = param
        self.has_envelopes = True
        self.created = FakeEnvelope()
        return self.created

    def clear_envelope(self, param):
        self.param = None
        self.has_envelopes = False

    def clear_all_envelopes(self):
        self.param = None
        self.has_envelopes = False


class FakeSlot:
    def __init__(self, clip=None):
        self.clip = clip
        self.has_clip = clip is not None


class FakeDevice:
    can_have_chains = False

    def __init__(self, *names):
        self.parameters = [FakeParam(n) for n in names]


def track(slots=None, devices=()):
    mixer = types.SimpleNamespace(
        volume=FakeParam("Volume"), panning=FakeParam("Pan"), sends=[FakeParam("Send A")]
    )
    fake = types.SimpleNamespace(devices=list(devices), mixer_device=mixer)
    if slots is not None:
        fake.clip_slots = slots
        fake.arrangement_clips = []
    return fake


class World:
    """A regular track t0 and return tracks rt0 (no envelopes) and rt1 (one on
    its device's Predelay), whose clips sit in slot 0."""

    def __init__(self):
        self.reverb = FakeDevice("Dry/Wet", "Predelay")
        self.with_env = FakeClip(self.reverb.parameters[1])
        self.empty = FakeClip()
        self.regular_clip = FakeClip()
        self.regular = track([FakeSlot(self.regular_clip)])
        self.rt0 = track([FakeSlot(self.empty), FakeSlot()])
        self.rt1 = track([FakeSlot(self.with_env)], [self.reverb])
        self.song = types.SimpleNamespace(
            tracks=[self.regular], return_tracks=[self.rt0, self.rt1]
        )

    def call(self, route, **params):
        return routes.ROUTES["/envelope/" + route](types.SimpleNamespace(song=self.song), params)


class ClipTrackTest(unittest.TestCase):
    def setUp(self):
        self.world = World()

    def test_finds_regular_and_return_tracks(self):
        song = self.world.song
        self.assertIs(clip_address.clip_track(song, "t0"), self.world.regular)
        self.assertIs(clip_address.clip_track(song, "rt0"), self.world.rt0)
        self.assertIs(clip_address.clip_track(song, "rt1"), self.world.rt1)

    def test_refuses_a_track_that_is_not_there(self):
        for path in ("t1", "rt2", "rt9"):
            with self.assertRaises(RouteError) as caught:
                clip_address.clip_track(self.world.song, path)
            self.assertEqual(caught.exception.status, 404)

    def test_refuses_the_main_track_and_anything_else(self):
        for path in ("mt", "r0", "rt", "rt-1", "t", "", None, "t0/s1"):
            with self.assertRaises(RouteError) as caught:
                clip_address.clip_track(self.world.song, path)
            self.assertEqual(caught.exception.status, 400)
            self.assertIn("the main track has no clips", str(caught.exception))

    def test_a_return_track_with_no_slots_is_refused_by_what_it_lacks(self):
        # Live 12: a return track has no clip slots, or an empty list of them.
        class Refuses:
            @property
            def clip_slots(self):
                raise RuntimeError("no clip slots")

        for bare in (track(), track([]), Refuses()):
            with self.assertRaises(RouteError) as caught:
                clip_address.clip_in_track(bare, {"track": "rt0", "slot": 0})
            self.assertEqual(caught.exception.status, 400)
            self.assertIn("return tracks have them from Live 13", str(caught.exception))

    def test_a_return_track_has_no_arrangement_clips_and_is_never_asked(self):
        class Refuses:
            @property
            def arrangement_clips(self):
                raise RuntimeError("Main, Group and Return Tracks have no arrangement clips")

        with self.assertRaises(RouteError) as caught:
            clip_address.clip_in_track(Refuses(), {"track": "rt0", "arrangement_index": 0})
        self.assertEqual(caught.exception.status, 400)
        self.assertIn("no arrangement clips", str(caught.exception))
        # A bad index is still refused as one.
        with self.assertRaises(RouteError) as caught:
            clip_address.clip_in_track(Refuses(), {"track": "rt0", "arrangement_index": "x"})
        self.assertIn("whole number", str(caught.exception))

    def test_a_regular_track_keeps_its_own_behavior(self):
        class Raises:
            @property
            def clip_slots(self):
                raise RuntimeError("Live is busy")

        # A raise on a regular track isn't dressed up as a Live 13 matter.
        with self.assertRaises(RuntimeError):
            clip_address.clip_in_track(Raises(), {"track": "t0", "slot": 0})
        # No slots on a regular track is a missing slot, as before.
        with self.assertRaises(RouteError) as caught:
            clip_address.clip_in_track(track([]), {"track": "t0", "slot": 0})
        self.assertEqual(caught.exception.status, 404)
        self.assertEqual(str(caught.exception).count("Live 13"), 0)

    def test_a_missing_slot_or_clip_is_a_404(self):
        for slot, message in ((5, "no slot 5"), (1, "slot 1 is empty")):
            with self.assertRaises(RouteError) as caught:
                clip_address.clip_in_track(self.world.rt0, {"track": "rt0", "slot": slot})
            self.assertEqual(caught.exception.status, 404)
            self.assertIn(message, str(caught.exception))


class ReturnTrackEnvelopeRoutesTest(unittest.TestCase):
    def setUp(self):
        self.world = World()

    def test_list_names_the_returns_own_device_parameter(self):
        listed = self.world.call("list", track="rt1", slot=0)["envelopes"]
        self.assertEqual(len(listed), 1)
        self.assertEqual(listed[0]["device"], "d0")
        self.assertEqual(listed[0]["parameter_index"], 1)
        self.assertEqual(listed[0]["parameter"]["name"], "Predelay")
        self.assertEqual(listed[0]["event_count"], 2)

    def test_list_of_an_empty_envelope_clip_is_empty(self):
        self.assertEqual(self.world.call("list", track="rt0", slot=0), {"envelopes": []})

    def test_read_gives_the_events(self):
        read = self.world.call("read", track="rt1", slot=0, device="d0", parameter=1)
        self.assertIs(read["exists"], True)
        self.assertEqual([e["time"] for e in read["events"]], [0.0, 1.0])

    def test_read_of_a_parameter_with_no_envelope_says_so(self):
        read = self.world.call("read", track="rt0", slot=0, parameter="volume")
        self.assertEqual(read["exists"], False)

    def test_write_reaches_the_returns_mixer(self):
        points = [{"time": 0, "value": 0.2}, {"time": 4, "value": 0.8}]
        written = self.world.call("write", track="rt0", slot=0, parameter="pan", points=points)
        self.assertEqual(written["parameter"]["name"], "Pan")
        self.assertIs(self.world.empty.param, self.world.rt0.mixer_device.panning)
        self.assertEqual(len(self.world.empty.created.events), 2)
        # Another clip is untouched.
        self.assertFalse(self.world.regular_clip.has_envelopes)

    def test_write_reaches_a_return_send(self):
        points = [{"time": 0, "value": 0.2}]
        self.world.call("write", track="rt0", slot=0, parameter="send0", points=points)
        self.assertIs(self.world.empty.param, self.world.rt0.mixer_device.sends[0])

    def test_write_reaches_the_returns_device_by_name(self):
        points = [{"time": 0, "value": 0.2}]
        self.world.call(
            "write", track="rt1", slot=0, device="d0", parameter="Dry/Wet", points=points
        )
        self.assertIs(self.world.with_env.param, self.world.reverb.parameters[0])

    def test_clear_one_parameter(self):
        cleared = self.world.call("clear", track="rt1", slot=0, device="d0", parameter=1)
        self.assertEqual(cleared, {"cleared": True})
        self.assertFalse(self.world.with_env.has_envelopes)

    def test_clear_all_says_what_it_removed_and_that_nothing_remains(self):
        self.assertEqual(
            self.world.call("clear", track="rt1", slot=0),
            {"cleared": True, "all": True, "remaining": False},
        )
        self.assertEqual(
            self.world.call("clear", track="rt0", slot=0),
            {"cleared": False, "all": True, "remaining": False},
        )

    def test_a_regular_track_clip_is_addressed_as_before(self):
        self.assertEqual(self.world.call("list", track="t0", slot=0), {"envelopes": []})

    def test_every_route_refuses_what_has_no_clip(self):
        for route in ("list", "read", "write", "clear"):
            for track_path, slot, status in (
                ("mt", 0, 400),
                ("rt2", 0, 404),
                ("rt0", 1, 404),
                ("rt0", 7, 404),
            ):
                with self.assertRaises(RouteError, msg="%s %s" % (route, track_path)) as caught:
                    self.world.call(
                        route,
                        track=track_path,
                        slot=slot,
                        parameter="volume",
                        points=[{"time": 0, "value": 0.5}],
                    )
                self.assertEqual(caught.exception.status, status)

    def test_a_live_12_return_track_is_refused_without_reading_anything(self):
        self.world.song.return_tracks = [track()]
        for route in ("list", "read", "write", "clear"):
            with self.assertRaises(RouteError) as caught:
                self.world.call(
                    route,
                    track="rt0",
                    slot=0,
                    parameter="volume",
                    points=[{"time": 0, "value": 0.5}],
                )
            self.assertEqual(caught.exception.status, 400)
            self.assertIn("from Live 13", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
