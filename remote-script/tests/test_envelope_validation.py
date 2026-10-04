# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: GPL-3.0-or-later

"""/envelope params that aren't valid are a clean 4xx, never a wrong read or 500.

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

from Producer_Pal import envelopes, routes  # noqa: E402


class FakeEvent:
    def __init__(self, time):
        self.time = time
        self.value = 0.5
        # Straight, except the second event, which is curved.
        x = 0.25 if time == 1.0 else 0.5
        self.control_coefficients = types.SimpleNamespace(x1=x, y1=0.5, x2=0.5, y2=0.5)


class FakeEnvelope:
    def __init__(self, count):
        self.count = count

    def events_in_range(self, start, end):
        return [FakeEvent(float(i)) for i in range(self.count)]

    def value_at_time(self, time):
        return 0.5


class FakeParam:
    name = "Gain"
    min = 0.0
    max = 1.0
    value = 0.5
    is_quantized = False
    is_enabled = True
    automation_state = 0

    def str_for_value(self, value):
        return "%s" % value


class FakeClip:
    has_envelopes = True

    def __init__(self, name, count=3):
        self.name = name
        self.env = FakeEnvelope(count)

    def automation_envelope(self, param):
        return self.env


class FakeSlot:
    def __init__(self, clip):
        self.clip = clip
        self.has_clip = True


class FakeDevice:
    def __init__(self):
        self.parameters = [FakeParam(), FakeParam()]


class FakeTrack:
    def __init__(self):
        self.clip_slots = [FakeSlot(FakeClip("first")), FakeSlot(FakeClip("last"))]
        self.arrangement_clips = [FakeClip("arr0"), FakeClip("arr1")]
        self.devices = [FakeDevice()]
        self.mixer_device = types.SimpleNamespace(
            volume=FakeParam(), panning=FakeParam(), sends=[]
        )


class FakeSong:
    def __init__(self):
        self.tracks = [FakeTrack()]
        self.return_tracks = [FakeTrack()]
        self.master_track = FakeTrack()


class FakeBridge:
    def __init__(self):
        self.song = FakeSong()


def call(route, **params):
    params.setdefault("track", "t0")
    if "arrangement_index" not in params:
        params.setdefault("slot", 0)
    return routes.ROUTES["/envelope/" + route](FakeBridge(), params)


class EnvelopeValidationTest(unittest.TestCase):
    def assert_400(self, route, **params):
        with self.assertRaises(routes.RouteError) as caught:
            call(route, **params)
        self.assertEqual(caught.exception.status, 400)
        return caught.exception.payload["error"]

    def test_valid_reads_still_work(self):
        self.assertEqual(call("read", slot=1)["event_count"], 3)
        self.assertEqual(call("read", slot="1", limit="2")["truncated"], True)
        out = call("read", arrangement_index=1, device="d0", parameter=1)
        self.assertTrue(out["exists"])

    def test_a_read_returns_coefficients_only_for_a_curved_event(self):
        events = call("read")["events"]
        self.assertEqual(
            [e.get("coefficients") for e in events],
            [None, [0.25, 0.5, 0.5, 0.5], None],
        )

    def test_negative_or_non_numeric_slot(self):
        for bad in (-1, "-1", "x", "²", 1.5, True, "", None):
            self.assert_400("read", slot=bad)

    def test_negative_or_non_numeric_arrangement_index(self):
        for bad in (-1, "x", "²"):
            self.assert_400("read", arrangement_index=bad)
        self.assert_400("read", slot=None, arrangement_index=None)

    def test_negative_or_non_numeric_parameter_index(self):
        for bad in (-1, "²"):
            self.assert_400("read", device="d0", parameter=bad)
        with self.assertRaises(routes.RouteError) as caught:
            call("read", device="d0", parameter=2)
        self.assertEqual(caught.exception.status, 404)

    def test_limit_must_be_a_positive_whole_number(self):
        for bad in (-2, 0, "x", "0", 1.5, True):
            self.assert_400("read", limit=bad)

    def test_malformed_points(self):
        for bad in (["a"], [{"time": 1}], [None], "abc", {"time": 1}, 5, [], None):
            self.assert_400("write", points=bad)
        self.assert_400("write")

    def test_points_cap_is_in_points(self):
        too_many = [{"time": i, "value": 0.5} for i in range(envelopes.MAX_EVENTS + 1)]
        self.assert_400("write", points=too_many)

    def test_return_and_master_tracks_have_no_clips(self):
        for bad in ("rt0", "mt", "t-1", "x", None):
            self.assert_400("list", track=bad)
        with self.assertRaises(routes.RouteError) as caught:
            call("list", track="t5")
        self.assertEqual(caught.exception.status, 404)


if __name__ == "__main__":
    unittest.main()
