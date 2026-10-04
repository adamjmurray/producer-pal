# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: GPL-3.0-or-later

"""/envelope/clear with no parameter says what it removed and what is left.

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


class FakeParam:
    name = "Volume"
    min = 0.0
    max = 1.0
    value = 0.5
    is_quantized = False
    is_enabled = True
    automation_state = 0

    def str_for_value(self, value):
        return "%s" % value


class FakeEnvelope:
    def events_in_range(self, start, end):
        return []


class FakeClip:
    """Holds automation on the track volume, plus envelopes the API can't see
    (modulation, clip-level, MIDI CC), which clear_all_envelopes leaves."""

    def __init__(self, param, automated, unreachable):
        self.param = param
        self.automated = automated
        self.unreachable = unreachable

    @property
    def has_envelopes(self):
        return self.automated or self.unreachable

    def automation_envelope(self, param):
        return FakeEnvelope() if self.automated and param is self.param else None

    def clear_all_envelopes(self):
        self.automated = False

    def clear_envelope(self, param):
        self.automated = False


class FakeSlot:
    has_clip = True

    def __init__(self, clip):
        self.clip = clip


class FakeBridge:
    def __init__(self, automated, unreachable):
        volume = FakeParam()
        clip = FakeClip(volume, automated, unreachable)
        track = types.SimpleNamespace(
            clip_slots=[FakeSlot(clip)],
            devices=[],
            mixer_device=types.SimpleNamespace(volume=volume, panning=FakeParam(), sends=[]),
        )
        self.song = types.SimpleNamespace(tracks=[track])


def clear(automated, unreachable, **params):
    bridge = FakeBridge(automated, unreachable)
    return routes.ROUTES["/envelope/clear"](bridge, dict({"track": "t0", "slot": 0}, **params))


class EnvelopeClearAllTest(unittest.TestCase):
    def test_removes_automation_and_leaves_nothing(self):
        self.assertEqual(
            clear(True, False),
            {"cleared": True, "all": True, "remaining": False},
        )

    def test_says_envelopes_remain_when_some_cannot_be_reached(self):
        self.assertEqual(
            clear(True, True),
            {"cleared": True, "all": True, "remaining": True},
        )

    def test_does_not_claim_a_clear_when_only_unreachable_envelopes_exist(self):
        self.assertEqual(
            clear(False, True),
            {"cleared": False, "all": True, "remaining": True},
        )

    def test_a_clip_with_no_envelopes(self):
        self.assertEqual(
            clear(False, False),
            {"cleared": False, "all": True, "remaining": False},
        )

    def test_clearing_one_parameter_is_unchanged(self):
        self.assertEqual(clear(True, False, parameter="volume"), {"cleared": True})
        self.assertEqual(clear(False, True, parameter="volume"), {"cleared": False})


if __name__ == "__main__":
    unittest.main()
