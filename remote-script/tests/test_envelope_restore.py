# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""/envelope/write puts the old envelope back when the new write fails.

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
STRAIGHT = (0.5, 0.5, 0.5, 0.5)
CURVE = (0.25, 0.75, 0.25, 0.75)


class FakeParam:
    name = "Volume"
    min = 0.0
    max = 1.0
    value = 0.5
    is_quantized = False
    is_enabled = True
    automation_state = 0

    def __init__(self, fail_re_enable=False):
        self.fail_re_enable = fail_re_enable
        self.re_enable_calls = 0

    def str_for_value(self, value):
        return "%s" % value

    def re_enable_automation(self):
        self.re_enable_calls += 1
        if self.fail_re_enable:
            raise RuntimeError("Live said no")


def event(time, value, coefficients=STRAIGHT):
    """A read event; `value` is Live's own unit, deliberately not the raw one."""
    x1, y1, x2, y2 = coefficients
    return types.SimpleNamespace(
        time=time,
        value=value * 100,
        raw=value,
        control_coefficients=types.SimpleNamespace(x1=x1, y1=y1, x2=x2, y2=y2),
    )


class FakeEnvelope:
    def __init__(self, events=(), fail_at=None, fail_read=False):
        self.read_events = list(events)
        self.written = []
        self.fail_at = fail_at
        self.fail_read = fail_read

    def events_in_range(self, start, end):
        if self.fail_read:
            raise RuntimeError("cannot read")
        return list(self.read_events)

    def value_at_time(self, time):
        # A step holds two events at one time; the later one reads just after.
        exact = [e for e in self.read_events if e.time == time]
        if exact:
            return exact[0].raw
        return [e for e in self.read_events if e.time <= time][-1].raw

    def create_event(self, new):
        if self.fail_at is not None and len(self.written) == self.fail_at:
            raise RuntimeError("Live said no")
        self.written.append(new)


class FakeClip:
    """`failures` lists how each created envelope behaves, in order: the new
    write first, then the restore."""

    def __init__(self, old=None, failures=(), fail_clear_at=()):
        self.env = old
        self.failures = list(failures)
        self.fail_clear_at = set(fail_clear_at)
        self.clears = 0
        self.created = []

    def automation_envelope(self, param):
        return self.env

    def clear_envelope(self, param):
        self.clears += 1
        if self.clears in self.fail_clear_at:
            raise RuntimeError("cannot clear")
        self.env = None

    def create_automation_envelope(self, param):
        fail_at = self.failures.pop(0) if self.failures else None
        self.env = FakeEnvelope(fail_at=fail_at)
        # The new envelope answers value_at_time for the success result.
        self.env.value_at_time = lambda time: 0.5
        self.created.append(self.env)
        return self.env


def write(clip, param=None):
    param = param or FakeParam()
    track = types.SimpleNamespace(
        clip_slots=[types.SimpleNamespace(has_clip=True, clip=clip)],
        devices=[],
        mixer_device=types.SimpleNamespace(volume=param, panning=FakeParam(), sends=[]),
    )
    return routes.ROUTES["/envelope/write"](
        types.SimpleNamespace(song=types.SimpleNamespace(tracks=[track])),
        {"track": "t0", "slot": 0, "parameter": "volume", "points": POINTS},
    )


def failure(clip, param=None):
    """The 500 message from a write that is expected to fail."""
    try:
        write(clip, param)
    except routes.RouteError as err:
        assert err.status == 500, err.status
        return err.payload["error"]
    raise AssertionError("the write did not fail")


class EnvelopeWriteRestoreTest(unittest.TestCase):
    def old(self, **kwargs):
        return FakeEnvelope(
            [event(0, 0.1), event(2, 0.4, CURVE), event(2, 0.9), event(6, 0.3)],
            **kwargs
        )

    def test_a_failed_write_restores_the_old_events_and_says_it_was_kept(self):
        clip = FakeClip(self.old(), failures=[1, None])
        message = failure(clip)
        self.assertIn("RuntimeError: Live said no", message)
        self.assertIn("the old envelope was kept", message)
        restored = clip.created[1].written
        # Raw values (not Live's display units), last time first, step pair in order.
        self.assertEqual(
            restored,
            [(6, 0.3), (2, 0.4, CURVE), (2, 0.9), (0, 0.1)],
        )
        self.assertIs(clip.env, clip.created[1])

    def test_the_old_envelope_is_restored_when_the_last_step_fails(self):
        param = FakeParam(fail_re_enable=True)
        clip = FakeClip(self.old(), failures=[None, None])
        self.assertIn("the old envelope was kept", failure(clip, param))
        self.assertEqual(len(clip.created[1].written), 4)

    def test_an_empty_old_envelope_comes_back_empty(self):
        clip = FakeClip(FakeEnvelope([]), failures=[0, None])
        self.assertIn("the old envelope was kept", failure(clip))
        self.assertEqual(clip.created[1].written, [])
        self.assertIsNotNone(clip.env)

    def test_a_failed_write_with_no_old_envelope_clears_and_says_nothing_was_written(self):
        clip = FakeClip(None, failures=[1])
        self.assertIn("nothing was written", failure(clip))
        self.assertIsNone(clip.env)
        self.assertEqual(len(clip.created), 1)

    def test_a_failed_restore_says_the_old_automation_was_lost(self):
        clip = FakeClip(self.old(), failures=[1, 2])
        message = failure(clip)
        self.assertIn("the old automation was lost", message)
        self.assertNotIn("partly written", message)
        self.assertIsNone(clip.env)

    def test_a_failed_restore_that_cannot_be_cleared_says_it_may_be_partly_written(self):
        # Clears: 1 before the write, 2 after its failure, 3 after the restore's.
        clip = FakeClip(self.old(), failures=[1, 2], fail_clear_at=[3])
        message = failure(clip)
        self.assertIn("the old automation was lost", message)
        self.assertIn("partly written", message)

    def test_when_the_half_written_envelope_cannot_be_cleared_nothing_is_restored(self):
        clip = FakeClip(self.old(), failures=[1], fail_clear_at=[2])
        message = failure(clip)
        self.assertIn("the old automation was lost", message)
        self.assertIn("partly written", message)
        self.assertEqual(len(clip.created), 1)

    def test_with_no_old_envelope_an_uncleared_failure_may_be_partly_written(self):
        clip = FakeClip(None, failures=[1], fail_clear_at=[1])
        self.assertEqual(
            failure(clip).split("; ")[-1], "the envelope may be partly written"
        )

    def test_an_unreadable_old_envelope_does_not_block_the_write(self):
        clip = FakeClip(self.old(fail_read=True))
        result = write(clip)
        self.assertEqual(len(result["samples"]), 2)
        self.assertEqual(len(clip.env.written), 2)

    def test_an_unreadable_old_envelope_is_reported_lost_when_the_write_fails(self):
        clip = FakeClip(self.old(fail_read=True), failures=[1])
        message = failure(clip)
        self.assertIn("the old automation was lost (it could not be read)", message)
        self.assertIsNone(clip.env)


class EnvelopeWriteSuccessTest(unittest.TestCase):
    def test_a_successful_write_replaces_the_old_envelope_without_restoring(self):
        old = FakeEnvelope([event(0, 0.1), event(6, 0.3)])
        clip = FakeClip(old)
        param = FakeParam()
        result = write(clip, param)
        self.assertEqual(clip.clears, 1)
        self.assertEqual(len(clip.created), 1)
        self.assertEqual(clip.env.written, [(4, 0.8), (0, 0.2)])
        self.assertEqual(param.re_enable_calls, 1)
        self.assertEqual([s["time"] for s in result["samples"]], [0, 4])


if __name__ == "__main__":
    unittest.main()
