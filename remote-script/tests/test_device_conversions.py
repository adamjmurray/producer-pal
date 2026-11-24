# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""/track/to-drum-rack and /device/drum-pad/to-track with fake Live objects.

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

TRACK_ROUTE = "/track/to-drum-rack"
PAD_ROUTE = "/device/drum-pad/to-track"
PAD_PATH = "live_set tracks 0 devices 0"


class FakeSlot:
    def __init__(self, has_clip):
        self.has_clip = has_clip


class FakeEffect:
    name = "EQ"
    class_name = "Eq8"
    can_have_drum_pads = False
    chains = ()


class FakeChain:
    def __init__(self, devices=()):
        self.devices = list(devices)


class FakeGroupDevice:
    """A rack holding devices in chains."""

    class_name = "InstrumentGroupDevice"
    can_have_drum_pads = False

    def __init__(self, name, chains):
        self.name = name
        self.chains = chains


class FakeTrack:
    def __init__(
        self,
        devices=None,
        clips=False,
        arrangement_clips=0,
        foldable=False,
        group=None,
    ):
        devices = [FakeEffect()] if devices is None else devices
        self.devices = list(devices)
        self.clip_slots = [FakeSlot(False), FakeSlot(clips)]
        self.arrangement_clips = [object()] * arrangement_clips
        self.is_foldable = foldable
        self.group_track = group
        self.is_grouped = group is not None


class FakeView:
    selected_track = None


class FakeSong:
    def __init__(self, tracks):
        self.tracks = tracks
        self.view = FakeView()


class FakeConversions:
    """Adds the new track after the selected one, as Live does."""

    def __init__(self, song, refuses=None, adds=True):
        self.song = song
        self.refuses = refuses
        self.adds = adds
        self.calls = []

    def _convert(self, call):
        if self.refuses is not None:
            raise RuntimeError(self.refuses)
        self.calls.append((self.song.view.selected_track,) + call)
        if self.adds:
            at = self.song.tracks.index(self.song.view.selected_track) + 1
            self.song.tracks.insert(at, FakeTrack())

    def move_devices_on_track_to_new_drum_rack_pad(self, song, index):
        source = song.tracks[index]
        self._convert((index,))
        # Live deletes a source track that has no clips.
        if not any(s.has_clip for s in source.clip_slots) and not source.arrangement_clips:
            song.tracks.remove(source)

    def create_midi_track_from_drum_pad(self, song, pad):
        self._convert((pad,))


class FakePad:
    def __init__(self, chains, devices=None):
        devices = [FakeEffect()] if devices is None else devices
        self.chains = [FakeChain(devices) for _ in range(chains)]


class FakeRack:
    name = "Kit"
    class_name = "DrumGroupDevice"
    can_have_drum_pads = True

    def __init__(self, pads=None):
        self.drum_pads = pads if pads is not None else [FakePad(0)] * 128


class ConversionTest(unittest.TestCase):
    def install(self, **options):
        self.conversions = FakeConversions(self.song, **options)
        Live.Conversions = self.conversions
        self.addCleanup(lambda: vars(Live).pop("Conversions", None))

    def start(self, tracks, **options):
        self.song = FakeSong(tracks)
        self.install(**options)
        self.bridge = types.SimpleNamespace(song=self.song)

    def call(self, route, params):
        return routes.ROUTES[route](self.bridge, params)

    def refused(self, route, params, status):
        with self.assertRaises(routes.RouteError) as caught:
            self.call(route, params)
        self.assertEqual(caught.exception.status, status)
        return str(caught.exception)


class TrackToDrumRackTest(ConversionTest):
    def convert(self, track="t0"):
        return self.call(TRACK_ROUTE, {"track": track})

    def test_is_a_write_route(self):
        self.assertIn(TRACK_ROUTE, routes.POST_ONLY)

    def test_keeps_a_source_that_has_clips(self):
        source = FakeTrack(clips=True)
        self.start([source])

        self.assertEqual(self.convert(), {"track_index": 1, "source_removed": False})
        self.assertEqual(self.conversions.calls, [(source, 0)])

    def test_keeps_a_source_that_has_only_arrangement_clips(self):
        self.start([FakeTrack(arrangement_clips=1)])

        self.assertEqual(self.convert(), {"track_index": 1, "source_removed": False})

    def test_answers_that_live_deleted_a_source_with_no_clips(self):
        source = FakeTrack()
        other = FakeTrack()
        self.start([other, source])

        self.assertEqual(self.convert("t1"), {"track_index": 1, "source_removed": True})
        self.assertNotIn(source, self.song.tracks)

    def test_selects_the_source_track_first(self):
        first = FakeTrack(clips=True)
        second = FakeTrack(clips=True)
        self.start([first, second])
        self.song.view.selected_track = first

        self.convert("t1")

        self.assertIs(self.conversions.calls[0][0], second)
        self.assertEqual(self.conversions.calls[0][1], 1)

    def test_refuses_a_group_track_without_asking_live(self):
        self.start([FakeTrack(foldable=True)])

        self.assertEqual(
            self.refused(TRACK_ROUTE, {"track": "t0"}, 409),
            "a group track has no devices to convert",
        )
        self.assertEqual(self.conversions.calls, [])

    def test_refuses_a_track_with_no_devices_without_asking_live(self):
        self.start([FakeTrack(devices=[], clips=True)])

        self.assertEqual(
            self.refused(TRACK_ROUTE, {"track": "t0"}, 409), "the track has no devices"
        )
        self.assertEqual(self.conversions.calls, [])

    def test_refuses_a_track_holding_producer_pal_without_asking_live(self):
        for name in ("Producer_Pal", "producer_pal.amxd"):
            with self.subTest(name=name):
                host = FakeEffect()
                host.name = name
                self.start([FakeTrack(devices=[FakeEffect(), host], clips=True)])

                self.assertEqual(
                    self.refused(TRACK_ROUTE, {"track": "t0"}, 409),
                    "the track holds the Producer Pal device",
                )
                self.assertEqual(self.conversions.calls, [])

    def test_refuses_a_track_holding_producer_pal_inside_a_rack(self):
        host = FakeEffect()
        host.name = "Producer_Pal"
        rack = FakeGroupDevice("Rack", [FakeChain([FakeEffect(), host])])
        self.start([FakeTrack(devices=[rack])])

        self.assertEqual(
            self.refused(TRACK_ROUTE, {"track": "t0"}, 409),
            "the track holds the Producer Pal device",
        )
        self.assertEqual(self.conversions.calls, [])

    def test_refuses_a_clipless_only_child_of_a_group_without_asking_live(self):
        # Live crashes when it deletes a group's only track.
        group = FakeTrack(foldable=True)
        self.start([group, FakeTrack(group=group)])

        self.assertIn(
            "only track in its group", self.refused(TRACK_ROUTE, {"track": "t1"}, 409)
        )
        self.assertEqual(self.conversions.calls, [])

    def test_allows_a_clipless_grouped_track_that_has_a_sibling(self):
        group = FakeTrack(foldable=True)
        self.start([group, FakeTrack(group=group), FakeTrack(group=group)])

        self.assertEqual(self.convert("t1"), {"track_index": 1, "source_removed": True})

    def test_allows_an_only_child_that_has_a_session_clip(self):
        group = FakeTrack(foldable=True)
        self.start([group, FakeTrack(group=group, clips=True)])

        self.assertEqual(
            self.convert("t1"), {"track_index": 2, "source_removed": False}
        )

    def test_allows_an_only_child_that_has_an_arrangement_clip(self):
        group = FakeTrack(foldable=True)
        self.start([group, FakeTrack(group=group, arrangement_clips=1)])

        self.assertEqual(
            self.convert("t1"), {"track_index": 2, "source_removed": False}
        )

    def test_counts_siblings_of_this_group_only(self):
        one = FakeTrack(foldable=True)
        two = FakeTrack(foldable=True)
        self.start([one, FakeTrack(group=one), two, FakeTrack(group=two)])

        self.refused(TRACK_ROUTE, {"track": "t1"}, 409)
        self.assertEqual(self.conversions.calls, [])

    def test_a_bad_track_is_a_400(self):
        self.start([FakeTrack()])

        self.refused(TRACK_ROUTE, {"track": "rt0"}, 400)
        self.refused(TRACK_ROUTE, {}, 400)

    def test_a_track_that_does_not_exist_is_a_404(self):
        self.start([FakeTrack()])

        self.assertEqual(self.refused(TRACK_ROUTE, {"track": "t3"}, 404), "no track t3")

    def test_an_older_live_without_the_conversion_is_a_409(self):
        self.start([FakeTrack(clips=True)])
        del Live.Conversions

        self.assertEqual(
            self.refused(TRACK_ROUTE, {"track": "t0"}, 409),
            "this Live version doesn't have this conversion",
        )

    def test_passes_on_what_live_refuses_with(self):
        self.start([FakeTrack(clips=True)], refuses="no way")

        self.assertEqual(
            self.refused(TRACK_ROUTE, {"track": "t0"}, 409),
            "Live refused the conversion: no way",
        )

    def test_says_so_when_live_made_no_new_track(self):
        self.start([FakeTrack(clips=True)], adds=False)

        self.assertEqual(
            self.refused(TRACK_ROUTE, {"track": "t0"}, 500), "Live made no new track"
        )


class DrumPadToTrackTest(ConversionTest):
    def convert(self, note=36, path=PAD_PATH):
        return self.call(PAD_ROUTE, {"device_path": path, "note": note})

    def start_with_rack(self, rack=None, **options):
        rack = rack or FakeRack([FakePad(1)] * 128)
        self.rack = rack
        self.start([FakeTrack(devices=[rack]), FakeTrack()], **options)

    def test_is_a_write_route(self):
        self.assertIn(PAD_ROUTE, routes.POST_ONLY)

    def test_copies_the_pad_and_answers_where_the_new_track_is(self):
        self.start_with_rack()

        self.assertEqual(self.convert(), {"track_index": 2})
        self.assertEqual(self.conversions.calls[0][1], self.rack.drum_pads[36])

    def test_selects_the_last_track_first(self):
        self.start_with_rack()
        last = self.song.tracks[-1]

        self.convert()

        self.assertIs(self.conversions.calls[0][0], last)

    def test_reads_the_note_from_a_string(self):
        self.start_with_rack()

        self.assertEqual(self.convert(note="36"), {"track_index": 2})

    def test_refuses_a_device_that_is_not_a_drum_rack(self):
        self.start_with_rack(FakeEffect())

        self.assertEqual(
            self.refused(PAD_ROUTE, {"device_path": PAD_PATH, "note": 36}, 409),
            "the device isn't a Drum Rack",
        )
        self.assertEqual(self.conversions.calls, [])

    def test_refuses_a_rack_with_no_pads_of_its_own_without_asking_live(self):
        self.start_with_rack(FakeRack([]))

        self.assertIn(
            "no pads of its own",
            self.refused(PAD_ROUTE, {"device_path": PAD_PATH, "note": 36}, 409),
        )
        self.assertEqual(self.conversions.calls, [])

    def test_refuses_an_empty_pad_without_asking_live(self):
        self.start_with_rack(FakeRack([FakePad(1)] * 36 + [FakePad(0)] * 92))

        self.assertEqual(
            self.refused(PAD_ROUTE, {"device_path": PAD_PATH, "note": 40}, 409),
            "the pad is empty",
        )
        self.assertEqual(self.conversions.calls, [])

    def test_refuses_a_pad_holding_producer_pal_without_asking_live(self):
        host = FakeEffect()
        host.name = "Producer_Pal"
        pads = [FakePad(1)] * 36 + [FakePad(1, [FakeEffect(), host])] + [FakePad(1)] * 91
        self.start_with_rack(FakeRack(pads))

        self.assertEqual(
            self.refused(PAD_ROUTE, {"device_path": PAD_PATH, "note": 36}, 409),
            "the pad holds the Producer Pal device",
        )
        self.assertEqual(self.conversions.calls, [])

    def test_copies_another_pad_when_one_holds_producer_pal(self):
        host = FakeEffect()
        host.name = "Producer_Pal"
        pads = [FakePad(1)] * 36 + [FakePad(1, [host])] + [FakePad(1)] * 91
        self.start_with_rack(FakeRack(pads))

        self.assertEqual(self.convert(note=40), {"track_index": 2})

    def test_a_bad_note_is_a_400(self):
        self.start_with_rack()

        for note in ("C1", 128, -1, 36.5, None):
            self.refused(PAD_ROUTE, {"device_path": PAD_PATH, "note": note}, 400)
        self.assertEqual(self.conversions.calls, [])

    def test_a_bad_device_path_is_a_404(self):
        self.start_with_rack()

        self.refused(PAD_ROUTE, {"device_path": "live_set tracks 5 devices 0", "note": 36}, 404)
        self.refused(PAD_ROUTE, {"device_path": "nonsense", "note": 36}, 404)

    def test_an_older_live_without_the_conversion_is_a_409(self):
        self.start_with_rack()
        del Live.Conversions

        self.assertEqual(
            self.refused(PAD_ROUTE, {"device_path": PAD_PATH, "note": 36}, 409),
            "this Live version doesn't have this conversion",
        )

    def test_passes_on_what_live_refuses_with(self):
        self.start_with_rack(refuses="no way")

        self.assertEqual(
            self.refused(PAD_ROUTE, {"device_path": PAD_PATH, "note": 36}, 409),
            "Live refused the conversion: no way",
        )

    def test_says_so_when_live_made_no_new_track(self):
        self.start_with_rack(adds=False)

        self.assertEqual(
            self.refused(PAD_ROUTE, {"device_path": PAD_PATH, "note": 36}, 500),
            "Live made no new track",
        )


if __name__ == "__main__":
    unittest.main()
