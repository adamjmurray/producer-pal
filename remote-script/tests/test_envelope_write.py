# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: GPL-3.0-or-later

"""/envelope/write re-enables the parameter's automation and says when it had
been overridden.

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
_live_envelope.EnvelopeEvent = lambda time, value: (time, value)
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
    def __init__(self):
        self.events = []

    def create_event(self, event):
        self.events.append(event)

    def value_at_time(self, time):
        return 0.5


class FakeClip:
    def __init__(self):
        self.env = None

    def automation_envelope(self, param):
        return self.env

    def clear_envelope(self, param):
        self.env = None

    def create_automation_envelope(self, param):
        self.env = FakeEnvelope()
        return self.env


def write(state):
    """Write POINTS to a track's volume that is in `state`; returns the result
    and the parameter."""
    param = FakeParam(state)
    clip = FakeClip()
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
        {"track": "t0", "slot": 0, "parameter": "volume", "points": POINTS},
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


if __name__ == "__main__":
    unittest.main()
