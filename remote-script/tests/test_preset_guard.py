# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: GPL-3.0-or-later

"""/load and /hotswap refusing a preset that holds the Producer Pal device.

Run: PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s remote-script/tests
"""

import os
import sys
import types
import unittest
from unittest import mock

# Keep __pycache__ out of the checkout.
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# Only Live's own Python has this module; the package imports it on load.
sys.modules.setdefault("Live", types.ModuleType("Live"))

from Producer_Pal import routes  # noqa: E402
from Producer_Pal.producer_pal_device import holds_producer_pal  # noqa: E402

AUDIO_EFFECT = 2


class FakeDevice:
    def __init__(
        self,
        name,
        chains=(),
        return_chains=(),
        drum_pads=(),
    ):
        self.name = name
        self.type = AUDIO_EFFECT
        self.chains = list(chains)
        self.return_chains = list(return_chains)
        self.drum_pads = list(drum_pads)


class FakeHolder:
    """A track or chain, which can delete a device."""

    def __init__(self, devices=(), name="Track", refuses=False):
        self.devices = list(devices)
        self.name = name
        self.refuses = refuses
        self.deleted = []

    def delete_device(self, index):
        if self.refuses:
            raise RuntimeError("Live said no")
        self.deleted.append(self.devices.pop(index).name)


def rack_with(*inner, **kwargs):
    return FakeDevice("Rack", chains=[FakeHolder(inner)], **kwargs)


def pal():
    return FakeDevice("Producer_Pal.amxd")


class FakeBrowser:
    def __init__(self, on_load=None):
        self.hotswap_target = None
        self.loaded = []
        self.on_load = on_load

    def load_item(self, item):
        self.loaded.append(item)
        if self.on_load is not None:
            self.on_load(self.hotswap_target)


class FakeSong:
    def __init__(self, tracks):
        self.tracks = list(tracks)
        self.return_tracks = []
        self.master_track = FakeHolder([], "Main")
        self.view = types.SimpleNamespace(selected_track=None)
        self.deleted_tracks = []

    def create_midi_track(self, index):
        track = FakeHolder([], "New")
        self.tracks.append(track)
        return track

    def delete_track(self, index):
        self.deleted_tracks.append(self.tracks.pop(index))


ITEM = types.SimpleNamespace(name="Cool Rack.adg", is_loadable=True)


def bridge_for(song, browser):
    return types.SimpleNamespace(song=song, app=types.SimpleNamespace(browser=browser))


def load(song, browser, item=ITEM, params=None):
    with mock.patch.object(routes, "_find_item", return_value=(item, "x", None)):
        return routes.load(bridge_for(song, browser), params or {"track_index": 0})


def hotswap(song, browser, device_path="live_set tracks 0 devices 0"):
    with mock.patch.object(routes, "_find_item", return_value=(ITEM, "x", None)):
        return routes.hotswap_device(
            bridge_for(song, browser), {"device_path": device_path}
        )


class HoldsProducerPalTest(unittest.TestCase):
    def test_finds_it_by_name_in_any_case_with_or_without_the_suffix(self):
        for name in ("Producer_Pal", "producer_pal.AMXD", " PRODUCER_PAL "):
            self.assertTrue(holds_producer_pal(FakeDevice(name)), name)

    def test_finds_it_in_chains_return_chains_and_drum_pads(self):
        pad = types.SimpleNamespace(chains=[FakeHolder([pal()])])

        self.assertTrue(holds_producer_pal(rack_with(pal())))
        self.assertTrue(
            holds_producer_pal(FakeDevice("R", return_chains=[FakeHolder([pal()])]))
        )
        self.assertTrue(holds_producer_pal(FakeDevice("Drums", drum_pads=[pad])))
        self.assertTrue(holds_producer_pal(rack_with(rack_with(pal()))))

    def test_walks_a_rack_that_raises_on_drum_pads(self):
        # Live raises rather than answering empty on a rack that isn't a
        # Drum Rack.
        class InstrumentRack(FakeDevice):
            @property
            def drum_pads(self):
                raise RuntimeError("Only drum racks can have pads!")

            @drum_pads.setter
            def drum_pads(self, value):
                pass

        self.assertTrue(
            holds_producer_pal(InstrumentRack("R", chains=[FakeHolder([pal()])]))
        )
        self.assertFalse(holds_producer_pal(InstrumentRack("R")))

    def test_is_false_for_other_devices(self):
        self.assertFalse(holds_producer_pal(FakeDevice("Reverb")))
        self.assertFalse(holds_producer_pal(rack_with(FakeDevice("Reverb"))))


class LoadTest(unittest.TestCase):
    def assert_refused_and_removed(self, added):
        existing = FakeDevice("EQ")
        track = FakeHolder([existing])
        browser = FakeBrowser(lambda _: track.devices.append(added))
        song = FakeSong([track])

        with self.assertRaises(routes.RouteError) as caught:
            load(song, browser)

        self.assertEqual(caught.exception.status, 409)
        message = caught.exception.payload["error"]
        self.assertIn("contains the Producer Pal device", message)
        self.assertIn("a Set can only have once", message)
        self.assertTrue(message.endswith("nothing was loaded"))
        self.assertEqual(track.devices, [existing])
        self.assertEqual(track.deleted, [added.name])

    def test_refuses_a_rack_with_producer_pal_in_a_chain(self):
        self.assert_refused_and_removed(rack_with(pal()))

    def test_refuses_a_rack_with_producer_pal_in_a_return_chain(self):
        self.assert_refused_and_removed(
            FakeDevice("Rack", return_chains=[FakeHolder([pal()])])
        )

    def test_refuses_a_drum_rack_with_producer_pal_on_a_pad(self):
        pad = types.SimpleNamespace(chains=[FakeHolder([pal()])])
        self.assert_refused_and_removed(FakeDevice("Drums", drum_pads=[pad]))

    def test_refuses_a_nested_rack(self):
        self.assert_refused_and_removed(rack_with(rack_with(pal())))

    def test_deletes_only_the_added_devices_that_hold_producer_pal(self):
        track = FakeHolder([])
        clean = FakeDevice("EQ")
        browser = FakeBrowser(
            lambda _: track.devices.extend([clean, rack_with(pal())])
        )

        with self.assertRaises(routes.RouteError):
            load(FakeSong([track]), browser)

        self.assertEqual(track.devices, [clean])
        self.assertEqual(track.deleted, ["Rack"])

    def test_leaves_the_users_own_producer_pal_alone(self):
        users = pal()
        track = FakeHolder([users])
        clean = rack_with(FakeDevice("EQ"))
        result = load(
            FakeSong([track]),
            FakeBrowser(lambda _: track.devices.append(clean)),
        )

        self.assertEqual(result["devices"], ["Producer_Pal.amxd", "Rack"])
        self.assertEqual(track.deleted, [])

    def test_deletes_only_the_new_device_next_to_the_users_producer_pal(self):
        users = pal()
        track = FakeHolder([users])
        added = rack_with(pal())

        with self.assertRaises(routes.RouteError):
            load(FakeSong([track]), FakeBrowser(lambda _: track.devices.append(added)))

        self.assertEqual(track.devices, [users])
        self.assertEqual(track.deleted, ["Rack"])

    def test_deletes_the_track_it_made_instead(self):
        song = FakeSong([FakeHolder([FakeDevice("Mine")])])
        browser = FakeBrowser(
            lambda _: song.tracks[-1].devices.append(rack_with(pal()))
        )

        with self.assertRaises(routes.RouteError) as caught:
            load(song, browser, params={"track_type": "midi"})

        self.assertTrue(
            caught.exception.payload["error"].endswith("nothing was loaded")
        )
        self.assertEqual([t.name for t in song.tracks], ["Track"])
        self.assertEqual([t.name for t in song.deleted_tracks], ["New"])
        self.assertEqual(song.tracks[0].devices[0].name, "Mine")

    def test_says_so_when_the_loaded_device_cannot_be_removed(self):
        track = FakeHolder([], name="Drums", refuses=True)
        browser = FakeBrowser(lambda _: track.devices.append(rack_with(pal())))

        with self.assertRaises(routes.RouteError) as caught:
            load(FakeSong([track]), browser)

        message = caught.exception.payload["error"]
        self.assertEqual(caught.exception.status, 409)
        self.assertIn("the new device couldn't be removed (Live said no)", message)
        self.assertIn("remove it by hand", message)
        self.assertNotIn("nothing was loaded", message)

    def test_says_so_when_the_track_it_made_cannot_be_deleted(self):
        song = FakeSong([])
        browser = FakeBrowser(
            lambda _: song.tracks[-1].devices.append(rack_with(pal()))
        )
        song.delete_track = mock.Mock(side_effect=RuntimeError("no"))

        with self.assertRaises(routes.RouteError) as caught:
            load(song, browser, params={"track_type": "midi"})

        self.assertIn(
            "the new device couldn't be removed", caught.exception.payload["error"]
        )

    def test_loads_a_preset_without_producer_pal(self):
        track = FakeHolder([])
        browser = FakeBrowser(
            lambda _: track.devices.append(rack_with(FakeDevice("EQ")))
        )
        result = load(FakeSong([track]), browser)

        self.assertEqual(result["devices"], ["Rack"])
        self.assertEqual(track.deleted, [])

    def test_loads_producer_pal_itself_into_a_set_without_it(self):
        track = FakeHolder([])
        browser = FakeBrowser(lambda _: track.devices.append(pal()))
        item = types.SimpleNamespace(name="Producer_Pal.amxd", is_loadable=True)
        result = load(FakeSong([track]), browser, item=item)

        self.assertEqual(result["devices"], ["Producer_Pal.amxd"])
        self.assertEqual(track.deleted, [])

    def test_loads_when_no_new_device_has_shown_up_yet(self):
        track = FakeHolder([FakeDevice("EQ")])
        result = load(FakeSong([track]), FakeBrowser())

        self.assertEqual(result["devices"], ["EQ"])


class HotswapTest(unittest.TestCase):
    def swap_in(self, track, new_device):
        def on_load(target):
            track.devices[track.devices.index(target)] = new_device

        return FakeBrowser(on_load)

    def test_deletes_a_replacement_with_producer_pal_and_says_the_slot_is_empty(self):
        track = FakeHolder([FakeDevice("Reverb")])
        browser = self.swap_in(track, rack_with(pal()))

        with self.assertRaises(routes.RouteError) as caught:
            hotswap(FakeSong([track]), browser)

        self.assertEqual(caught.exception.status, 409)
        self.assertTrue(caught.exception.payload["changed"])
        message = caught.exception.payload["error"]
        self.assertIn("contains the Producer Pal device", message)
        self.assertIn("its slot is now empty", message)
        self.assertEqual(track.devices, [])

    def test_deletes_a_rack_kept_in_place_that_now_holds_producer_pal(self):
        track = FakeHolder([rack_with(FakeDevice("Reverb"))])
        browser = FakeBrowser(lambda target: target.chains[0].devices.append(pal()))

        with self.assertRaises(routes.RouteError) as caught:
            hotswap(FakeSong([track]), browser)

        self.assertTrue(caught.exception.payload["changed"])
        self.assertEqual(track.devices, [])

    def test_deletes_inside_a_chain(self):
        chain = FakeHolder([FakeDevice("Reverb")], name="Chain")
        track = FakeHolder([FakeDevice("Rack", chains=[chain])])
        browser = FakeBrowser(
            lambda target: chain.devices.__setitem__(0, rack_with(pal()))
        )

        with self.assertRaises(routes.RouteError):
            hotswap(
                FakeSong([track]),
                browser,
                "live_set tracks 0 devices 0 chains 0 devices 0",
            )

        self.assertEqual(chain.devices, [])
        self.assertEqual(len(track.devices), 1)

    def test_says_so_when_the_device_cannot_be_deleted(self):
        track = FakeHolder([FakeDevice("Reverb")], refuses=True)
        browser = self.swap_in(track, rack_with(pal()))

        with self.assertRaises(routes.RouteError) as caught:
            hotswap(FakeSong([track]), browser)

        self.assertTrue(caught.exception.payload["changed"])
        message = caught.exception.payload["error"]
        self.assertIn("removing it failed (Live said no)", message)
        self.assertIn("delete the device at live_set tracks 0 devices 0", message)
        self.assertNotIn("slot is now empty", message)

    def test_refuses_a_target_that_holds_producer_pal_before_loading(self):
        for target in (pal(), rack_with(pal())):
            track = FakeHolder([target])
            browser = FakeBrowser()

            with self.assertRaises(routes.RouteError) as caught:
                hotswap(FakeSong([track]), browser)

            self.assertEqual(caught.exception.status, 409)
            self.assertNotIn("changed", caught.exception.payload)
            self.assertEqual(browser.loaded, [])
            self.assertEqual(track.devices, [target])

    def test_hotswaps_a_preset_without_producer_pal(self):
        track = FakeHolder([FakeDevice("Reverb")])
        browser = self.swap_in(track, rack_with(FakeDevice("EQ")))
        result = hotswap(FakeSong([track]), browser)

        self.assertEqual(result["device"], {"name": "Rack", "replaced": True})
        self.assertEqual(track.deleted, [])


if __name__ == "__main__":
    unittest.main()
