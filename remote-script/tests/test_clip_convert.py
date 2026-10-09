# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""/clip/convert checks the clip, starts Live's conversion, and answers at once.

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

import Live  # noqa: E402
from Producer_Pal import routes  # noqa: E402
from Producer_Pal.errors import RouteError  # noqa: E402


class FakeConversions:
    """Records each call. Live's own functions return None and work later."""

    AudioToMidiType = types.SimpleNamespace(
        harmony_to_midi=0, melody_to_midi=1, drums_to_midi=2
    )

    def __init__(self, convertible=True, refuses=None):
        self.convertible = convertible
        self.refuses = refuses
        self.calls = []

    def is_convertible_to_midi(self, song, clip):
        return self.convertible

    def _run(self, name, *args):
        if self.refuses is not None:
            raise RuntimeError(self.refuses)
        self.calls.append((name,) + args)

    def audio_to_midi_clip(self, song, clip, kind):
        self._run("audio_to_midi_clip", clip, kind)

    def create_midi_track_with_simpler(self, song, clip):
        self._run("create_midi_track_with_simpler", clip)

    def create_drum_rack_from_audio_clip(self, song, clip):
        self._run("create_drum_rack_from_audio_clip", clip)


class FakeClip:
    def __init__(self, is_audio_clip=True, is_recording=False):
        self.is_audio_clip = is_audio_clip
        self.is_recording = is_recording


class FakeSlot:
    def __init__(self, clip):
        self.clip = clip
        self.has_clip = clip is not None


class FakeTrack:
    def __init__(self, session_clip, arrangement_clip):
        self.clip_slots = [FakeSlot(session_clip), FakeSlot(None)]
        self.arrangement_clips = [arrangement_clip]


class FakeBridge:
    def __init__(self, audio_clip, midi_clip):
        self.song = types.SimpleNamespace(
            tracks=[FakeTrack(audio_clip, audio_clip), FakeTrack(midi_clip, midi_clip)]
        )


class ConvertTest(unittest.TestCase):
    def setUp(self):
        self.audio = FakeClip(True)
        self.midi = FakeClip(False)
        self.bridge = FakeBridge(self.audio, self.midi)
        self.conversions = FakeConversions()
        Live.Conversions = self.conversions
        self.addCleanup(lambda: vars(Live).pop("Conversions", None))

    def convert(self, **params):
        return routes.ROUTES["/clip/convert"](
            self.bridge, dict({"track": "t0", "slot": 0, "type": "drums"}, **params)
        )

    def refusal(self, **params):
        with self.assertRaises(RouteError) as caught:
            self.convert(**params)
        return caught.exception

    def test_is_a_write_route(self):
        self.assertIn("/clip/convert", routes.POST_ONLY)

    def test_each_midi_kind_passes_its_algorithm(self):
        for kind, algorithm in (("harmony", 0), ("melody", 1), ("drums", 2)):
            self.conversions.calls.clear()
            self.assertEqual(self.convert(type=kind), {"started": True, "type": kind})
            self.assertEqual(
                self.conversions.calls, [("audio_to_midi_clip", self.audio, algorithm)]
            )

    def test_simpler_and_drum_rack_skip_the_convertible_check(self):
        self.conversions.convertible = False

        self.convert(type="simpler")
        self.convert(type="drum-rack")

        self.assertEqual(
            self.conversions.calls,
            [
                ("create_midi_track_with_simpler", self.audio),
                ("create_drum_rack_from_audio_clip", self.audio),
            ],
        )

    def test_reaches_an_arrangement_clip(self):
        params = {"track": "t0", "arrangement_index": 0, "type": "melody"}

        routes.ROUTES["/clip/convert"](self.bridge, params)

        self.assertEqual(self.conversions.calls, [("audio_to_midi_clip", self.audio, 1)])

    def test_refuses_a_midi_clip_without_asking_live(self):
        error = self.refusal(track="t1")

        self.assertEqual(error.status, 409)
        self.assertEqual(error.payload["error"], "only an audio clip can be converted")
        self.assertEqual(self.conversions.calls, [])

    def test_an_older_live_without_conversions_is_a_409(self):
        del Live.Conversions

        for kind in ("drums", "simpler"):
            error = self.refusal(type=kind)
            self.assertEqual(error.status, 409)
            self.assertEqual(
                error.payload["error"], "this Live version can't convert clips"
            )

    def test_a_live_missing_one_function_refuses_only_what_needs_it(self):
        del FakeConversions.create_midi_track_with_simpler
        self.addCleanup(
            setattr,
            FakeConversions,
            "create_midi_track_with_simpler",
            lambda self, song, clip: self._run("create_midi_track_with_simpler", clip),
        )

        self.assertEqual(self.refusal(type="simpler").status, 409)
        self.assertEqual(self.convert(type="drum-rack")["started"], True)

    def test_a_live_without_the_algorithm_list_is_a_409(self):
        del FakeConversions.AudioToMidiType
        self.addCleanup(
            setattr,
            FakeConversions,
            "AudioToMidiType",
            types.SimpleNamespace(harmony_to_midi=0, melody_to_midi=1, drums_to_midi=2),
        )

        self.assertEqual(self.refusal(type="drums").status, 409)

    def test_refuses_a_clip_that_is_recording(self):
        self.audio.is_recording = True

        error = self.refusal()

        self.assertEqual(error.status, 409)
        self.assertEqual(error.payload["error"], "a clip that is recording can't be converted")
        self.assertEqual(self.conversions.calls, [])

    def test_refuses_a_clip_live_says_isnt_convertible(self):
        self.conversions.convertible = False

        error = self.refusal(type="melody")

        self.assertEqual(error.status, 409)
        self.assertEqual(error.payload["error"], "Live can't convert this clip to MIDI")
        self.assertEqual(self.conversions.calls, [])

    def test_passes_on_what_live_refuses_with(self):
        self.conversions.refuses = "Invalid algorithm."

        error = self.refusal()

        self.assertEqual(error.status, 409)
        self.assertEqual(
            error.payload["error"], "Live refused the conversion: Invalid algorithm."
        )

    def test_refuses_an_unknown_type(self):
        error = self.refusal(type="bass")

        self.assertEqual(error.status, 400)
        self.assertIn("type must be one of harmony, melody, drums, simpler, drum-rack", error.payload["error"])

    def test_refuses_a_missing_type(self):
        error = self.refusal(type=None)

        self.assertEqual(error.status, 400)

    def test_refuses_a_clip_that_isnt_there(self):
        self.assertEqual(self.refusal(slot=1).status, 404)
        self.assertEqual(self.refusal(track="t9").status, 404)
        self.assertEqual(self.refusal(track="rt0").status, 400)


if __name__ == "__main__":
    unittest.main()
