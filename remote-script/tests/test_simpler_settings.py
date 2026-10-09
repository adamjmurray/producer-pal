# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""/device/simpler/read and /device/simpler/write with fake Live objects.

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

PATH = "live_set tracks 0 devices 0"


class FakeDevice:
    def __init__(self, name, class_name="Reverb"):
        self.name = name
        self.class_name = class_name


class FakeSimpler(FakeDevice):
    """Writes land as sent here; Live would clamp, which the route prevents."""

    def __init__(self, pitch_bend_range=5, note_pitch_bend_range=48):
        super().__init__("Simpler", "OriginalSimpler")
        self.pitch_bend_range = pitch_bend_range
        self.note_pitch_bend_range = note_pitch_bend_range


class FailingSimpler(FakeSimpler):
    """Live raises when a setting in `set_fails` is written or one in
    `read_fails` is read."""

    def __init__(self, set_fails=(), read_fails=()):
        super().__init__()
        self.set_fails = set(set_fails)
        self.read_fails = set(read_fails)

    def __setattr__(self, name, value):
        if name in self.__dict__.get("set_fails", ()):
            raise RuntimeError("Boost.Python.ArgumentError secret")
        super().__setattr__(name, value)

    def __getattribute__(self, name):
        if name in object.__getattribute__(self, "__dict__").get("read_fails", ()):
            raise RuntimeError("Boost.Python.ArgumentError secret")
        return super().__getattribute__(name)


class FakeChain:
    def __init__(self, devices):
        self.devices = devices


class FakeRack(FakeDevice):
    def __init__(self, chains):
        super().__init__("Rack", "InstrumentGroupDevice")
        self.chains = chains


class FakeTrack:
    def __init__(self, devices):
        self.devices = devices


def call(route, tracks, params):
    bridge = types.SimpleNamespace(song=types.SimpleNamespace(tracks=tracks))
    return routes.ROUTES[route](bridge, params)


def read(tracks, paths):
    return call("/device/simpler/read", tracks, {"device_paths": paths})


def write(tracks, **params):
    return call("/device/simpler/write", tracks, dict({"device_path": PATH}, **params))


def refused(test, run):
    with test.assertRaises(routes.RouteError) as caught:
        run()
    test.assertEqual(caught.exception.status, 400)
    return str(caught.exception)


class RegistrationTest(unittest.TestCase):
    def test_the_write_refuses_get_and_the_read_does_not(self):
        self.assertIn("/device/simpler/write", routes.POST_ONLY)
        self.assertNotIn("/device/simpler/read", routes.POST_ONLY)
        self.assertIn("/device/simpler/read", routes.ROUTES)
        self.assertIn("/device/simpler/write", routes.ROUTES)


class ReadSimplerSettingsTest(unittest.TestCase):
    def test_reads_both_ranges(self):
        result = read([FakeTrack([FakeSimpler(12, 24)])], [PATH])

        self.assertEqual(
            result,
            {"simplers": [{"pitch_bend_range": 12, "note_pitch_bend_range": 24}]},
        )

    def test_reaches_a_simpler_inside_a_chain(self):
        rack = FakeRack([FakeChain([FakeDevice("x"), FakeSimpler(2, 7)])])
        path = "live_set tracks 0 devices 0 chains 0 devices 1"

        self.assertEqual(
            read([FakeTrack([rack])], [path])["simplers"],
            [{"pitch_bend_range": 2, "note_pitch_bend_range": 7}],
        )

    def test_answers_every_path_in_order(self):
        track = FakeTrack([FakeSimpler(1, 2), FakeSimpler(3, 4)])
        paths = ["live_set tracks 0 devices 1", PATH]

        self.assertEqual(
            read([track], paths)["simplers"],
            [
                {"pitch_bend_range": 3, "note_pitch_bend_range": 4},
                {"pitch_bend_range": 1, "note_pitch_bend_range": 2},
            ],
        )

    def test_a_device_that_is_not_a_simpler_is_an_error_in_its_own_entry(self):
        track = FakeTrack([FakeDevice("Reverb"), FakeSimpler()])
        paths = [PATH, "live_set tracks 0 devices 1"]
        entries = read([track], paths)["simplers"]

        self.assertEqual(entries[0], {"error": "'Reverb' is not a Simpler"})
        self.assertEqual(entries[1]["pitch_bend_range"], 5)

    def test_a_path_that_names_nothing_is_an_error_in_its_own_entry(self):
        entries = read([FakeTrack([])], [PATH])["simplers"]

        self.assertEqual(entries, [{"error": "device_path has nothing at devices 0"}])

    def test_an_unexpected_failure_is_an_error_in_its_own_entry(self):
        broken = FailingSimpler(read_fails={"pitch_bend_range"})
        entries = read([FakeTrack([broken, FakeSimpler()])], [PATH, "live_set tracks 0 devices 1"])

        self.assertEqual(entries["simplers"][0], {"error": "Live couldn't read it"})
        self.assertEqual(entries["simplers"][1]["pitch_bend_range"], 5)

    def test_refuses_a_request_without_paths(self):
        for params in ({}, {"device_paths": []}, {"device_paths": PATH}):
            refused(
                self,
                lambda: routes.ROUTES["/device/simpler/read"](
                    types.SimpleNamespace(), params
                ),
            )

    def test_refuses_a_runaway_list(self):
        refused(self, lambda: read([FakeTrack([FakeSimpler()])], [PATH] * 201))


class WriteSimplerSettingsTest(unittest.TestCase):
    def test_sets_both_and_answers_what_it_reads_back(self):
        simpler = FakeSimpler()
        result = write(
            [FakeTrack([simpler])], pitch_bend_range=12, note_pitch_bend_range=24
        )

        self.assertEqual(result, {"pitch_bend_range": 12, "note_pitch_bend_range": 24})
        self.assertEqual((simpler.pitch_bend_range, simpler.note_pitch_bend_range), (12, 24))

    def test_sets_one_and_leaves_the_other(self):
        simpler = FakeSimpler(5, 48)
        result = write([FakeTrack([simpler])], note_pitch_bend_range=0)

        self.assertEqual(result, {"pitch_bend_range": 5, "note_pitch_bend_range": 0})

    def test_takes_the_ends_of_each_range(self):
        simpler = FakeSimpler()
        write([FakeTrack([simpler])], pitch_bend_range=24, note_pitch_bend_range=48)
        write([FakeTrack([simpler])], pitch_bend_range=0, note_pitch_bend_range=0)

        self.assertEqual((simpler.pitch_bend_range, simpler.note_pitch_bend_range), (0, 0))

    def test_takes_a_whole_number_sent_as_text_or_a_float(self):
        simpler = FakeSimpler()
        write([FakeTrack([simpler])], pitch_bend_range="7", note_pitch_bend_range=9.0)

        self.assertEqual((simpler.pitch_bend_range, simpler.note_pitch_bend_range), (7, 9))
        self.assertIsInstance(simpler.note_pitch_bend_range, int)

    def test_refuses_a_value_out_of_range_without_writing_the_other(self):
        for params in (
            {"pitch_bend_range": 25},
            {"pitch_bend_range": -1},
            {"note_pitch_bend_range": 49},
            {"pitch_bend_range": 3, "note_pitch_bend_range": 96},
        ):
            simpler = FakeSimpler(5, 48)
            refused(self, lambda: write([FakeTrack([simpler])], **params))

            self.assertEqual((simpler.pitch_bend_range, simpler.note_pitch_bend_range), (5, 48))

    def test_refuses_what_is_not_a_whole_number(self):
        for value in (1.5, "1.5", "twelve", True, [3], float("nan")):
            simpler = FakeSimpler()
            refused(self, lambda: write([FakeTrack([simpler])], pitch_bend_range=value))

            self.assertEqual(simpler.pitch_bend_range, 5)

    def test_a_failure_reading_back_is_a_plain_500(self):
        simpler = FailingSimpler(read_fails={"note_pitch_bend_range"})

        with self.assertRaises(routes.RouteError) as caught:
            write([FakeTrack([simpler])], pitch_bend_range=3)

        self.assertEqual(caught.exception.status, 500)
        self.assertEqual(
            str(caught.exception),
            "Live couldn't read the settings back, after pitch_bend_range to 3 was set",
        )
        self.assertNotIn("Boost", str(caught.exception))

    def test_a_failure_after_one_setting_landed_says_which(self):
        simpler = FailingSimpler(set_fails={"note_pitch_bend_range"})

        with self.assertRaises(routes.RouteError) as caught:
            write([FakeTrack([simpler])], pitch_bend_range=3, note_pitch_bend_range=9)

        self.assertEqual(caught.exception.status, 500)
        self.assertEqual(
            str(caught.exception),
            "Live refused to set note_pitch_bend_range, after pitch_bend_range to 3 was set",
        )
        self.assertEqual(simpler.pitch_bend_range, 3)

    def test_a_failure_with_nothing_landed_says_so_plainly(self):
        simpler = FailingSimpler(set_fails={"pitch_bend_range"})

        with self.assertRaises(routes.RouteError) as caught:
            write([FakeTrack([simpler])], pitch_bend_range=3)

        self.assertEqual(str(caught.exception), "Live refused to set pitch_bend_range")

    def test_refuses_a_call_that_sets_nothing(self):
        refused(self, lambda: write([FakeTrack([FakeSimpler()])]))

    def test_refuses_a_device_that_is_not_a_simpler(self):
        message = refused(
            self, lambda: write([FakeTrack([FakeDevice("Reverb")])], pitch_bend_range=3)
        )

        self.assertEqual(message, "'Reverb' is not a Simpler")

    def test_refuses_a_path_that_names_nothing(self):
        refused(self, lambda: write([FakeTrack([])], pitch_bend_range=3))


if __name__ == "__main__":
    unittest.main()
