# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: GPL-3.0-or-later

"""/envelope/write re-enables the parameter's automation and says when it had
been overridden, writes curves last point first, and fails cleanly.

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
# Events are plain tuples: (time, value) or (time, value, coefficients).
_live_envelope.EnvelopeEvent = lambda *args: args
_live_envelope.EnvelopeEventControlCoefficients = lambda *args: args
sys.modules["Live.Envelope"] = _live_envelope
_live.Envelope = _live_envelope

from Producer_Pal import routes  # noqa: E402

POINTS = [{"time": 0, "value": 0.2}, {"time": 4, "value": 0.8}]


class FakeParam:
    name = "Volume"
    min = 0.0
    max = 1.0
    value = 0.5
    is_quantized = False
    is_enabled = True

    def __init__(self, state):
        self.automation_state = state
        self.re_enable_calls = 0

    def str_for_value(self, value):
        return "%s" % value

    def re_enable_automation(self):
        self.re_enable_calls += 1
        # So a read after the write would miss the override.
        self.automation_state = 1


class FakeEnvelope:
    def __init__(self, fail_at=None):
        self.events = []
        self.fail_at = fail_at

    def create_event(self, event):
        if self.fail_at is not None and len(self.events) == self.fail_at:
            raise RuntimeError("Live said no")
        self.events.append(event)

    def value_at_time(self, time):
        return 0.5


class FakeClip:
    def __init__(self, fail_at=None):
        self.env = None
        self.fail_at = fail_at
        self.clears = 0

    def automation_envelope(self, param):
        return self.env

    def clear_envelope(self, param):
        self.env = None
        self.clears += 1

    def create_automation_envelope(self, param):
        self.env = FakeEnvelope(self.fail_at)
        return self.env


def write(state, points=POINTS, clip=None):
    """Write `points` to a track's volume that is in `state`; returns the result
    and the parameter."""
    param = FakeParam(state)
    clip = clip or FakeClip()
    track = types.SimpleNamespace(
        clip_slots=[types.SimpleNamespace(has_clip=True, clip=clip)],
        devices=[],
        mixer_device=types.SimpleNamespace(volume=param, panning=FakeParam(0), sends=[]),
    )
    song = types.SimpleNamespace(
        tracks=[track],
        begin_undo_step=lambda: None,
        end_undo_step=lambda: None,
    )
    result = routes.ROUTES["/envelope/write"](
        types.SimpleNamespace(song=song),
        {"track": "t0", "slot": 0, "parameter": "volume", "points": points},
    )
    return result, param, clip


class EnvelopeWriteReEnableTest(unittest.TestCase):
    def test_an_overridden_parameter_is_re_enabled_and_reported(self):
        result, param, clip = write(2)
        self.assertEqual(param.re_enable_calls, 1)
        self.assertIs(result["re_enabled"], True)
        self.assertEqual(len(clip.env.events), 2)

    def test_a_parameter_with_automation_is_re_enabled_without_a_report(self):
        result, param, _ = write(1)
        self.assertEqual(param.re_enable_calls, 1)
        self.assertNotIn("re_enabled", result)

    def test_a_parameter_without_automation_is_re_enabled_without_a_report(self):
        result, param, _ = write(0)
        self.assertEqual(param.re_enable_calls, 1)
        self.assertNotIn("re_enabled", result)


CURVE = [0.25, 0.75, 0.25, 0.75]


class EnvelopeWriteOrderTest(unittest.TestCase):
    def events(self, points):
        return write(0, points)[2].env.events

    def test_events_are_created_last_point_first(self):
        events = self.events(
            [
                {"time": 0, "value": 0.2, "coefficients": CURVE},
                {"time": 4, "value": 0.8, "coefficients": CURVE},
                {"time": 8, "value": 0.5},
            ]
        )
        self.assertEqual(
            events,
            [(8, 0.5), (4, 0.8, tuple(CURVE)), (0, 0.2, tuple(CURVE))],
        )

    def test_a_step_keeps_its_pair_in_order_and_carries_the_curve_on_the_new_value(self):
        events = self.events(
            [
                {"time": 0, "value": 0.2},
                {"time": 4, "value": 0.8, "jump": True, "coefficients": CURVE},
                {"time": 8, "value": 0.5},
            ]
        )
        self.assertEqual(
            events,
            [(8, 0.5), (4, 0.2), (4, 0.8, tuple(CURVE)), (0, 0.2)],
        )

    def test_a_ramp_that_ends_in_a_jump_makes_no_duplicate_event(self):
        events = self.events(
            [
                {"time": 0, "value": 0},
                {"time": 4, "value": 0.25},
                {"time": 4, "value": 0.9, "jump": True},
            ]
        )
        self.assertEqual(events, [(4, 0.25), (4, 0.9), (0, 0)])

    def test_a_jump_to_the_same_value_keeps_the_curve_after_it(self):
        events = self.events(
            [
                {"time": 0, "value": 0.5},
                {"time": 4, "value": 0.5, "jump": True, "coefficients": CURVE},
                {"time": 8, "value": 1},
            ]
        )
        self.assertEqual(events, [(8, 1), (4, 0.5, tuple(CURVE)), (0, 0.5)])

    def test_a_straight_point_carries_no_coefficients(self):
        for event in self.events(POINTS):
            self.assertEqual(len(event), 2)


class EnvelopeWriteFailureTest(unittest.TestCase):
    def test_a_failure_part_way_removes_the_partial_envelope_and_says_so(self):
        clip = FakeClip(fail_at=1)
        with self.assertRaises(routes.RouteError) as caught:
            write(0, POINTS, clip)
        self.assertEqual(caught.exception.status, 500)
        message = caught.exception.payload["error"]
        self.assertIn("RuntimeError: Live said no", message)
        self.assertIn("the envelope was removed", message)
        self.assertIsNone(clip.env)

    def test_the_undo_step_still_ends_after_a_failure(self):
        steps = []
        param = FakeParam(0)
        clip = FakeClip(fail_at=0)
        track = types.SimpleNamespace(
            clip_slots=[types.SimpleNamespace(has_clip=True, clip=clip)],
            devices=[],
            mixer_device=types.SimpleNamespace(volume=param, panning=FakeParam(0), sends=[]),
        )
        song = types.SimpleNamespace(
            tracks=[track],
            begin_undo_step=lambda: steps.append("begin"),
            end_undo_step=lambda: steps.append("end"),
        )
        with self.assertRaises(routes.RouteError):
            routes.ROUTES["/envelope/write"](
                types.SimpleNamespace(song=song),
                {"track": "t0", "slot": 0, "parameter": "volume", "points": POINTS},
            )
        self.assertEqual(steps, ["begin", "end"])
        self.assertEqual(param.re_enable_calls, 0)

    def test_bad_coefficients_are_refused_before_anything_changes(self):
        for bad in ([0.5] * 3, [0.5] * 5, "abc", [0.5, 0.5, 0.5, 1.5], [0.5, 0.5, 0.5, "x"], [0.5, 0.5, 0.5, -0.1]):
            clip = FakeClip()
            with self.assertRaises(routes.RouteError) as caught:
                write(0, [{"time": 0, "value": 0.2, "coefficients": bad}], clip)
            self.assertEqual(caught.exception.status, 400)
            self.assertEqual(clip.clears, 0)
            self.assertIsNone(clip.env)


if __name__ == "__main__":
    unittest.main()
