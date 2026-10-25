# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""Clip watches with fake Live objects: the cap, every way a listener is
removed, re-binding, coalescing and overflow.

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

from Producer_Pal import bridge, hot_reload, routes, watches  # noqa: E402
from Producer_Pal.errors import RouteError  # noqa: E402


class FakeLiveObject:
    """Has `add_/remove_/_has_listener` for each property, like a Live object.

    Once `die()` is called, reading it or touching its listeners raises, as a
    deleted Live object does.
    """

    def __init__(self, properties):
        self._callbacks = {prop: [] for prop in properties}
        self._dead = False
        for prop in properties:
            setattr(self, "add_%s_listener" % prop, self._adder(prop))
            setattr(self, "remove_%s_listener" % prop, self._remover(prop))
            setattr(self, "%s_has_listener" % prop, self._asker(prop))

    def _adder(self, prop):
        def add(callback):
            self._check()
            self._callbacks[prop].append(callback)

        return add

    def _remover(self, prop):
        def remove(callback):
            self._check()
            self._callbacks[prop].remove(callback)

        return remove

    def _asker(self, prop):
        def has(callback):
            self._check()
            return callback in self._callbacks[prop]

        return has

    def _check(self):
        if self._dead:
            raise RuntimeError("object is no longer valid")

    def die(self):
        self._dead = True

    def fire(self, prop):
        for callback in list(self._callbacks[prop]):
            callback()

    def listeners(self):
        return sum(len(callbacks) for callbacks in self._callbacks.values())


class FakeClip(FakeLiveObject):
    def __init__(self, properties=watches.CLIP_PROPERTIES):
        super().__init__(properties)


class FakeSlot(FakeLiveObject):
    def __init__(self, clip=None):
        super().__init__(watches.SLOT_PROPERTIES)
        self._clip = clip

    @property
    def has_clip(self):
        self._check()
        return self._clip is not None

    @property
    def clip(self):
        self._check()
        return self._clip

    def put(self, clip):
        self._clip = clip
        self.fire("has_clip")


class FakeTrack:
    def __init__(self, slots):
        self.clip_slots = slots


class FakeSong:
    def __init__(self, tracks):
        self.tracks = tracks


def song_with(*rows):
    """A song whose tracks hold the given rows of slots."""
    return FakeSong([FakeTrack(list(row)) for row in rows])


class RegistryCase(unittest.TestCase):
    def setUp(self):
        self.logged = []
        self.registry = watches.WatchRegistry(log=self.logged.append)
        self.clip = FakeClip()
        self.slot = FakeSlot(self.clip)
        self.song = song_with([self.slot])

    def watch(self, owner="w1", follow=True, song=None):
        return self.registry.watch(song or self.song, owner, 0, 0, follow)

    def read(self, since=None, song=None):
        return self.registry.read(song or self.song, since)

    def events(self, since):
        return self.read(since)["events"]


class WatchTest(RegistryCase):
    def test_it_listens_to_the_slot_and_the_clip(self):
        reply = self.watch()

        self.assertTrue(reply["has_clip"])
        self.assertEqual(self.slot.listeners(), 1)
        self.assertEqual(self.clip.listeners(), len(watches.CLIP_PROPERTIES))
        self.assertEqual(self.registry.listener_count(), 1 + len(watches.CLIP_PROPERTIES))

    def test_an_empty_slot_is_watched_for_a_clip_to_arrive(self):
        slot = FakeSlot()
        reply = self.watch(song=song_with([slot]))

        self.assertFalse(reply["has_clip"])
        self.assertEqual(slot.listeners(), 1)

    def test_a_slot_that_isnt_there_is_refused(self):
        with self.assertRaises(RouteError) as caught:
            self.registry.watch(self.song, "w1", 3, 0)
        self.assertEqual(caught.exception.status, 404)
        with self.assertRaises(RouteError):
            self.registry.watch(self.song, "w1", 0, 5)
        self.assertEqual(self.registry.owners(), [])

    def test_a_pinned_watch_needs_a_clip(self):
        with self.assertRaises(RouteError) as caught:
            self.registry.watch(song_with([FakeSlot()]), "w1", 0, 0, follow=False)
        self.assertEqual(caught.exception.status, 404)

    def test_a_listener_the_clip_lacks_is_skipped(self):
        clip = FakeClip(("notes", "name"))
        self.watch(song=song_with([FakeSlot(clip)]))

        self.assertEqual(clip.listeners(), 2)

    def test_a_listener_that_cant_be_added_is_logged_and_the_rest_still_are(self):
        clip = FakeClip(("notes", "name"))
        clip.add_notes_listener = mock.Mock(side_effect=RuntimeError("no"))
        self.watch(song=song_with([FakeSlot(clip)]))

        self.assertEqual(clip.listeners(), 1)
        self.assertTrue(any("notes" in line for line in self.logged))


class CapTest(RegistryCase):
    def test_the_cap_refuses_a_new_owner_and_names_the_limit(self):
        registry = watches.WatchRegistry(max_watches=2)
        registry.watch(self.song, "a", 0, 0)
        registry.watch(self.song, "b", 0, 0)

        with self.assertRaises(RouteError) as caught:
            registry.watch(self.song, "c", 0, 0)

        self.assertEqual(caught.exception.status, 409)
        self.assertEqual(caught.exception.payload["limit"], 2)
        self.assertEqual(registry.owners(), ["a", "b"])

    def test_an_owner_at_the_cap_can_move_its_watch(self):
        registry = watches.WatchRegistry(max_watches=1)
        registry.watch(self.song, "a", 0, 0)
        other = FakeSlot(FakeClip())
        song = song_with([self.slot, other])
        registry.watch(song, "a", 0, 1)

        self.assertEqual(self.slot.listeners(), 0)
        self.assertEqual(other.listeners(), 1)

    def test_a_refused_move_keeps_the_old_watch(self):
        self.watch()
        with self.assertRaises(RouteError):
            self.registry.watch(self.song, "w1", 9, 9)

        self.assertEqual(self.registry.owners(), ["w1"])
        self.assertEqual(self.slot.listeners(), 1)

    def test_a_freed_place_can_be_used_again(self):
        registry = watches.WatchRegistry(max_watches=1)
        registry.watch(self.song, "a", 0, 0)
        registry.unwatch("a")
        registry.watch(self.song, "b", 0, 0)

        self.assertEqual(registry.owners(), ["b"])


class RemovalTest(RegistryCase):
    """Every path that ends a watch leaves no listener behind."""

    def assert_clean(self, *objects):
        for obj in objects:
            self.assertEqual(obj.listeners(), 0)
        self.assertEqual(self.registry.listener_count(), 0)

    def test_unwatch(self):
        self.watch()
        self.assertTrue(self.registry.unwatch("w1"))

        self.assert_clean(self.slot, self.clip)
        self.assertFalse(self.registry.unwatch("w1"))

    def test_replacing_an_owners_watch(self):
        self.watch()
        other = FakeSlot(FakeClip())
        self.registry.watch(song_with([self.slot, other]), "w1", 0, 1)

        self.assertEqual(self.slot.listeners() + self.clip.listeners(), 0)
        self.assertEqual(other.listeners(), 1)

    def test_close(self):
        self.watch("a")
        self.watch("b")
        self.registry.close()

        self.assert_clean(self.slot, self.clip)
        self.assertEqual(self.registry.owners(), [])

    def test_a_new_song(self):
        self.watch()
        old_epoch = self.registry.epoch
        reply = self.read(song=song_with([FakeSlot(FakeClip())]))

        self.assert_clean(self.slot, self.clip)
        self.assertEqual(reply["watching"], [])
        self.assertNotEqual(reply["epoch"], old_epoch)

    def test_a_pinned_clip_replaced(self):
        self.watch(follow=False)
        self.slot.put(FakeClip())
        reply = self.read(0)

        self.assertEqual(reply["watching"], [])
        self.assertEqual(reply["events"][0]["kind"], "gone")
        self.assert_clean(self.slot, self.clip)

    def test_a_pinned_clip_deleted(self):
        self.watch(follow=False)
        self.slot.put(None)
        reply = self.read(0)

        self.assertEqual(reply["events"][0]["kind"], "gone")
        self.assert_clean(self.slot, self.clip)

    def test_a_pinned_object_that_died(self):
        self.watch(follow=False)
        self.slot.die()
        self.clip.die()
        reply = self.read(0)

        self.assertEqual(reply["events"][0]["kind"], "gone")
        self.assertEqual(reply["watching"], [])
        self.assertEqual(self.registry.listener_count(), 0)

    def test_a_removed_clip_that_died_does_not_break_removal(self):
        self.watch()
        self.clip.die()

        self.assertTrue(self.registry.unwatch("w1"))
        self.assertEqual(self.slot.listeners(), 0)

    def test_a_late_callback_after_removal_is_ignored(self):
        self.watch()
        late = self.clip._callbacks["notes"][0]
        self.registry.unwatch("w1")
        late()

        self.assertEqual(self.read(0)["events"], [])

    def test_a_late_callback_after_close_is_ignored(self):
        self.watch()
        late = self.clip._callbacks["notes"][0]
        self.registry.close()
        late()

        self.assertEqual(self.read(song=self.song)["events"], [])


class FollowTest(RegistryCase):
    def test_a_replacement_clip_rebinds_and_reports_it(self):
        self.watch()
        replacement = FakeClip()
        self.slot.put(replacement)
        reply = self.read(0)

        self.assertEqual(self.clip.listeners(), 0)
        self.assertEqual(replacement.listeners(), len(watches.CLIP_PROPERTIES))
        self.assertEqual(reply["watching"], ["w1"])
        self.assertEqual(
            [(e["owner"], e["kind"]) for e in reply["events"]], [("w1", "rebound")]
        )
        self.assertIn("has_clip", reply["events"][0]["fields"])

    def test_the_new_clip_is_heard_after_the_rebind(self):
        self.watch()
        replacement = FakeClip()
        self.slot.put(replacement)
        seq = self.read(0)["seq"]
        replacement.fire("notes")

        events = self.events(seq)
        self.assertEqual([e["kind"] for e in events], ["changed"])
        self.assertEqual(events[0]["fields"], ["notes"])

    def test_a_deleted_clip_leaves_an_empty_slot_still_watched(self):
        self.watch()
        self.slot.put(None)
        self.read(0)

        self.assertEqual(self.clip.listeners(), 0)
        self.assertEqual(self.slot.listeners(), 1)
        self.assertEqual(self.registry.owners(), ["w1"])

    def test_a_clip_arriving_in_an_empty_slot(self):
        slot = FakeSlot()
        song = song_with([slot])
        self.watch(song=song)
        clip = FakeClip()
        slot.put(clip)
        events = self.registry.read(song, 0)["events"]

        self.assertEqual(events[0]["kind"], "rebound")
        self.assertEqual(clip.listeners(), len(watches.CLIP_PROPERTIES))

    def test_a_replacement_nobody_fired_for_is_still_noticed(self):
        self.watch()
        self.slot._clip = FakeClip()  # no callback
        reply = self.read(0)

        self.assertEqual(reply["events"][0]["kind"], "rebound")

    def test_it_follows_the_position_when_tracks_shift(self):
        self.watch()
        newcomer = FakeSlot(FakeClip())
        shifted = song_with([newcomer], [self.slot])
        self.registry._song = shifted  # the same Set, its tracks edited
        reply = self.read(0, song=shifted)

        self.assertEqual(self.slot.listeners(), 0)
        self.assertEqual(self.clip.listeners(), 0)
        self.assertEqual(newcomer.listeners(), 1)
        self.assertEqual(reply["events"][0]["kind"], "rebound")

    def test_a_deleted_track_leaves_the_watch_waiting_for_one_to_return(self):
        self.watch()
        empty = FakeSong([])
        self.registry._song = empty
        gone = self.read(0, song=empty)

        self.assertEqual(gone["watching"], ["w1"])
        self.assertEqual(self.registry.listener_count(), 0)
        self.assertEqual(gone["events"][0]["kind"], "rebound")

        back = FakeSlot(FakeClip())
        song = song_with([back])
        self.registry._song = song
        again = self.read(gone["seq"], song=song)

        self.assertEqual(again["events"][0]["kind"], "rebound")
        self.assertEqual(back.listeners(), 1)

    def test_a_read_that_fails_is_logged_and_does_not_end_the_read(self):
        self.watch()
        self.slot.die()
        reply = self.read(0)

        self.assertEqual(reply["watching"], ["w1"])
        self.assertTrue(any("RuntimeError" in line for line in self.logged))


class EventTest(RegistryCase):
    def test_a_first_read_returns_the_position_and_no_events(self):
        self.watch()
        self.clip.fire("notes")
        reply = self.read()

        self.assertEqual(reply["events"], [])
        self.assertEqual(reply["seq"], 1)
        self.assertFalse(reply["resync"])

    def test_many_changes_in_one_tick_become_one_event(self):
        self.watch()
        for prop in ("notes", "notes", "name", "notes", "loop_end"):
            self.clip.fire(prop)
        events = self.events(0)

        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["fields"], ["loop_end", "name", "notes"])
        self.assertEqual(events[0]["kind"], "changed")
        self.assertEqual(events[0]["seq"], 1)

    def test_each_owner_gets_its_own_event(self):
        other = FakeSlot(FakeClip())
        song = song_with([self.slot, other])
        self.registry.watch(song, "a", 0, 0)
        self.registry.watch(song, "b", 0, 1)
        self.clip.fire("notes")
        other._clip.fire("name")
        events = self.registry.read(song, 0)["events"]

        self.assertEqual(
            [(e["seq"], e["owner"]) for e in events], [(1, "a"), (2, "b")]
        )

    def test_a_stronger_change_wins_within_one_event(self):
        self.watch()
        self.clip.fire("notes")
        self.slot.put(FakeClip())
        events = self.events(0)

        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["kind"], "rebound")

    def test_a_reader_gets_only_what_is_after_its_position(self):
        self.watch()
        self.clip.fire("notes")
        first = self.read(0)
        self.clip.fire("name")
        later = self.read(first["seq"])

        self.assertEqual([e["seq"] for e in first["events"]], [1])
        self.assertEqual([e["seq"] for e in later["events"]], [2])
        self.assertEqual(self.read(later["seq"])["events"], [])


class OverflowTest(unittest.TestCase):
    def setUp(self):
        self.registry = watches.WatchRegistry(max_events=3)
        self.clip = FakeClip()
        self.song = song_with([FakeSlot(self.clip)])
        self.registry.watch(self.song, "w1", 0, 0)

    def change(self, times):
        for _ in range(times):
            self.clip.fire("notes")
            self.registry.read(self.song, 0)

    def test_the_oldest_events_are_dropped(self):
        self.change(5)
        reply = self.registry.read(self.song, 4)

        self.assertEqual(reply["seq"], 5)
        self.assertEqual([e["seq"] for e in reply["events"]], [5])

    def test_a_reader_behind_the_ring_is_told_to_resync(self):
        self.change(5)
        reply = self.registry.read(self.song, 1)

        self.assertTrue(reply["resync"])
        self.assertEqual(reply["events"], [])
        self.assertEqual(reply["seq"], 5)

    def test_a_reader_just_inside_the_ring_is_not(self):
        self.change(5)

        self.assertFalse(self.registry.read(self.song, 2)["resync"])

    def test_a_reader_ahead_of_the_registry_is_told_to_resync(self):
        # It talked to an earlier registry, or to a script that restarted.
        self.assertTrue(self.registry.read(self.song, 99)["resync"])

    def test_pending_marks_cannot_outgrow_the_watches(self):
        for _ in range(1000):
            self.clip.fire("notes")

        self.assertEqual(len(self.registry._pending), 1)


class RouteTest(unittest.TestCase):
    def setUp(self):
        self.slot = FakeSlot(FakeClip())
        self.bridge = types.SimpleNamespace(
            song=song_with([self.slot]), log=lambda message: None
        )

    def call(self, name, **params):
        return routes.ROUTES[name](self.bridge, params)

    def test_watch_then_events_then_unwatch(self):
        reply = self.call("/watch", owner="w1", path="t0/s0")
        self.assertTrue(reply["has_clip"])
        self.slot.clip.fire("notes")

        events = self.call("/events", since="0")
        self.assertEqual(events["events"][0]["owner"], "w1")
        self.assertEqual(self.call("/unwatch", owner="w1"), {"existed": True})
        self.assertEqual(self.slot.listeners() + self.slot.clip.listeners(), 0)

    def test_the_registry_lives_on_the_bridge(self):
        self.call("/watch", owner="w1", path="t0/s0")

        self.assertIs(self.bridge.watches, watches._registry(self.bridge))

    def test_follow_can_be_turned_off(self):
        self.call("/watch", owner="w1", path="t0/s0", follow="false")
        self.slot.put(FakeClip())

        self.assertEqual(self.call("/events", since="0")["events"][0]["kind"], "gone")

    def test_bad_input_is_a_400(self):
        for params in (
            {"path": "t0/s0"},
            {"owner": "", "path": "t0/s0"},
            {"owner": "w1", "path": "t0"},
            {"owner": "w1", "path": "t0/s0/x"},
        ):
            with self.assertRaises(RouteError) as caught:
                self.call("/watch", **params)
            self.assertEqual(caught.exception.status, 400, params)
        with self.assertRaises(RouteError):
            self.call("/events", since="-1")
        with self.assertRaises(RouteError):
            self.call("/unwatch")

    def test_starting_and_stopping_refuse_get(self):
        self.assertIn("/watch", routes.POST_ONLY)
        self.assertIn("/unwatch", routes.POST_ONLY)
        self.assertNotIn("/events", routes.POST_ONLY)


class SameObjectTest(unittest.TestCase):
    def test_wrappers_of_one_live_object_are_the_same(self):
        a = types.SimpleNamespace(_live_ptr=7)
        b = types.SimpleNamespace(_live_ptr=7)
        c = types.SimpleNamespace(_live_ptr=8)

        self.assertTrue(watches._same(a, b))
        self.assertFalse(watches._same(a, c))

    def test_without_a_pointer_it_falls_back_to_equality(self):
        marker = object()

        self.assertTrue(watches._same(marker, marker))
        self.assertFalse(watches._same(object(), object()))

    def test_nothing_is_only_the_same_as_nothing(self):
        self.assertTrue(watches._same(None, None))
        self.assertFalse(watches._same(None, object()))


class DispatchTest(unittest.TestCase):
    def test_starting_a_watch_with_get_is_a_405(self):
        surface = object.__new__(bridge.ProducerPalBridge)
        surface._jobs = types.SimpleNamespace(put=lambda job: job.run())

        status, _ = surface._dispatch("GET", "/watch", {})

        self.assertEqual(status, 405)


class BridgeTest(unittest.TestCase):
    def make_bridge(self):
        surface = object.__new__(bridge.ProducerPalBridge)
        surface._c_instance = types.SimpleNamespace(log_message=lambda m: None)
        surface._server = mock.Mock()
        surface.watches = None
        return surface

    def registry_with_a_watch(self):
        slot = FakeSlot(FakeClip())
        registry = watches.WatchRegistry()
        registry.watch(song_with([slot]), "w1", 0, 0)
        return registry, slot

    def test_disconnecting_removes_every_listener(self):
        surface = self.make_bridge()
        surface.watches, slot = self.registry_with_a_watch()
        surface.disconnect()

        self.assertEqual(slot.listeners() + slot.clip.listeners(), 0)
        self.assertIsNone(surface.watches)
        surface._server.stop.assert_called_once()

    def test_disconnecting_survives_a_registry_that_fails_to_close(self):
        surface = self.make_bridge()
        surface.watches = mock.Mock(close=mock.Mock(side_effect=RuntimeError("x")))
        surface.disconnect()

        surface._server.stop.assert_called_once()

    def test_disconnecting_with_no_watches_is_fine(self):
        self.make_bridge().disconnect()

    def test_a_hot_reload_removes_every_listener_first(self):
        surface = self.make_bridge()
        surface.watches, slot = self.registry_with_a_watch()
        order = []

        def reload():
            order.append(slot.listeners() + slot.clip.listeners())
            return ["watches"], "abc123abc123"

        with mock.patch.object(hot_reload, "reload_implementation", reload):
            hot_reload.reload_route(surface, {})

        self.assertEqual(order, [0])
        self.assertIsNone(surface.watches)

    def test_a_failed_reload_has_still_released_the_watches(self):
        surface = self.make_bridge()
        surface.watches, slot = self.registry_with_a_watch()
        failure = hot_reload.ReloadError("watches", "trace")

        with mock.patch.object(hot_reload, "reload_implementation", side_effect=failure):
            with self.assertRaises(RouteError):
                hot_reload.reload_route(surface, {})

        self.assertEqual(slot.listeners(), 0)


if __name__ == "__main__":
    unittest.main()
