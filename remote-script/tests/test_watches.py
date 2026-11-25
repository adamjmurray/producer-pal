# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""Clip watches with fake Live objects: binding to a clip object, moves, deletes,
the cap, every way a listener is removed, coalescing and overflow.

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

    def __init__(self, properties=()):
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
    def __init__(self, name="Clip", length=4.0, properties=watches.CLIP_PROPERTIES):
        super().__init__(properties)
        self._name = name
        self._length = length
        self._slot = None

    @property
    def name(self):
        self._check()
        return self._name

    @property
    def length(self):
        self._check()
        return self._length

    @property
    def canonical_parent(self):
        self._check()
        return self._slot


class FakeSlot(FakeLiveObject):
    def __init__(self, clip=None):
        super().__init__()
        self._clip = None
        self._track = None
        if clip is not None:
            self.put(clip)

    @property
    def has_clip(self):
        self._check()
        return self._clip is not None

    @property
    def clip(self):
        self._check()
        return self._clip

    @property
    def canonical_parent(self):
        self._check()
        return self._track

    def put(self, clip):
        self._clip = clip
        if clip is not None:
            clip._slot = self

    def delete_clip(self):
        """What deleting does: the clip object dies, the slot is empty."""
        if self._clip is not None:
            self._clip.die()
        self._clip = None


class FakeTrack:
    def __init__(self, slots):
        self.clip_slots = slots
        for slot in slots:
            slot._track = self


class FakeSong:
    def __init__(self, tracks):
        self.tracks = tracks


def song_with(*rows):
    """A song whose tracks hold the given rows of slots."""
    return FakeSong([FakeTrack(list(row)) for row in rows])


def move_clip(clip, to_slot):
    """A move where Live keeps the clip object."""
    clip._slot._clip = None
    to_slot.put(clip)


class RegistryCase(unittest.TestCase):
    def setUp(self):
        self.logged = []
        self.registry = watches.WatchRegistry(log=self.logged.append)
        self.clip = FakeClip("Bass", 8.0)
        self.slot = FakeSlot(self.clip)
        self.song = song_with([self.slot])

    def watch(self, owner="w1", song=None, track=0, slot=0, fingerprint=None):
        return self.registry.watch(song or self.song, owner, track, slot, fingerprint)

    def read(self, since=None, song=None):
        return self.registry.read(song or self.song, since)

    def events(self, since=0, song=None):
        return self.read(since, song)["events"]


class WatchTest(RegistryCase):
    def test_it_listens_to_the_clip_and_reports_its_fingerprint(self):
        reply = self.watch()

        self.assertEqual(reply["path"], "t0/s0")
        self.assertEqual(reply["fingerprint"], {"name": "Bass", "length": 8.0})
        self.assertEqual(self.clip.listeners(), len(watches.CLIP_PROPERTIES))
        self.assertEqual(self.slot.listeners(), 0)

    def test_an_empty_slot_is_refused_and_says_why(self):
        with self.assertRaises(RouteError) as caught:
            self.watch(song=song_with([FakeSlot()]))

        self.assertEqual(caught.exception.status, 404)
        self.assertEqual(caught.exception.payload["reason"], "empty")
        self.assertEqual(self.registry.owners(), [])

    def test_a_slot_that_isnt_there_is_refused(self):
        for track, slot in ((3, 0), (0, 5)):
            with self.assertRaises(RouteError) as caught:
                self.watch(track=track, slot=slot)
            self.assertEqual(caught.exception.payload["reason"], "no_slot")

    def test_a_matching_fingerprint_binds(self):
        self.watch(fingerprint={"name": "Bass", "length": 8.0})

        self.assertEqual(self.registry.owners(), ["w1"])

    def test_a_different_clip_is_refused(self):
        for fingerprint in (
            {"name": "Lead", "length": 8.0},
            {"name": "Bass", "length": 4.0},
        ):
            with self.assertRaises(RouteError) as caught:
                self.watch(fingerprint=fingerprint)
            self.assertEqual(caught.exception.status, 409)
            self.assertEqual(caught.exception.payload["reason"], "mismatch")
            self.assertEqual(
                caught.exception.payload["found"], {"name": "Bass", "length": 8.0}
            )

        self.assertEqual(self.clip.listeners(), 0)

    def test_a_listener_the_clip_lacks_is_skipped(self):
        clip = FakeClip(properties=("notes", "name"))
        self.watch(song=song_with([FakeSlot(clip)]))

        self.assertEqual(clip.listeners(), 2)

    def test_a_listener_that_cant_be_added_is_logged_and_the_rest_still_are(self):
        clip = FakeClip(properties=("notes", "name"))
        clip.add_notes_listener = mock.Mock(side_effect=RuntimeError("no"))
        self.watch(song=song_with([FakeSlot(clip)]))

        self.assertEqual(clip.listeners(), 1)
        self.assertTrue(any("notes" in line for line in self.logged))


class CapTest(RegistryCase):
    def test_the_cap_refuses_a_new_owner_and_names_the_limit(self):
        registry = watches.WatchRegistry(max_watches=2)
        song = song_with([FakeSlot(FakeClip()), FakeSlot(FakeClip()), FakeSlot(FakeClip())])
        registry.watch(song, "a", 0, 0)
        registry.watch(song, "b", 0, 1)

        with self.assertRaises(RouteError) as caught:
            registry.watch(song, "c", 0, 2)

        self.assertEqual(caught.exception.status, 409)
        self.assertEqual(caught.exception.payload["limit"], 2)
        self.assertEqual(caught.exception.payload["reason"], "limit")
        self.assertEqual(registry.owners(), ["a", "b"])

    def test_an_owner_at_the_cap_can_move_its_watch(self):
        registry = watches.WatchRegistry(max_watches=1)
        other = FakeSlot(FakeClip())
        song = song_with([self.slot, other])
        registry.watch(song, "a", 0, 0)
        registry.watch(song, "a", 0, 1)

        self.assertEqual(self.clip.listeners(), 0)
        self.assertEqual(other.clip.listeners(), len(watches.CLIP_PROPERTIES))

    def test_a_refused_move_keeps_the_old_watch(self):
        self.watch()
        with self.assertRaises(RouteError):
            self.watch(track=9)

        self.assertEqual(self.registry.owners(), ["w1"])
        self.assertEqual(self.clip.listeners(), len(watches.CLIP_PROPERTIES))

    def test_a_gone_watch_still_counts_until_it_is_unwatched(self):
        registry = watches.WatchRegistry(max_watches=1)
        other = FakeSlot(FakeClip())
        song = song_with([self.slot, other])
        registry.watch(song, "a", 0, 0)
        self.slot.delete_clip()
        registry.read(song)

        with self.assertRaises(RouteError):
            registry.watch(song, "b", 0, 1)

        registry.unwatch("a")
        registry.watch(song, "b", 0, 1)

        self.assertEqual(registry.owners(), ["b"])


class RemovalTest(RegistryCase):
    """Every path that ends a watch leaves no listener behind."""

    def test_unwatch(self):
        self.watch()

        self.assertTrue(self.registry.unwatch("w1"))
        self.assertEqual(self.clip.listeners(), 0)
        self.assertEqual(self.registry.listener_count(), 0)
        self.assertFalse(self.registry.unwatch("w1"))

    def test_replacing_an_owners_watch(self):
        self.watch()
        other = FakeSlot(FakeClip())
        self.registry.watch(song_with([self.slot, other]), "w1", 0, 1)

        self.assertEqual(self.clip.listeners(), 0)
        self.assertEqual(other.clip.listeners(), len(watches.CLIP_PROPERTIES))

    def test_close(self):
        self.watch("a")
        self.watch("b")
        self.registry.close()

        self.assertEqual(self.clip.listeners(), 0)
        self.assertEqual(self.registry.owners(), [])

    def test_a_new_song(self):
        self.watch()
        old_epoch = self.registry.epoch
        reply = self.read(song=song_with([FakeSlot(FakeClip())]))

        self.assertEqual(self.clip.listeners(), 0)
        self.assertEqual(reply["watching"], [])
        self.assertNotEqual(reply["epoch"], old_epoch)

    def test_a_deleted_clip(self):
        self.watch()
        self.slot.delete_clip()
        reply = self.read(0)

        self.assertEqual(reply["watching"], [])
        self.assertEqual(self.registry.listener_count(), 0)
        self.assertEqual(reply["events"][0]["kind"], "gone")

    def test_a_removed_clip_that_died_does_not_break_removal(self):
        self.watch()
        self.clip.die()

        self.assertTrue(self.registry.unwatch("w1"))

    def test_a_late_callback_after_removal_is_ignored(self):
        self.watch()
        late = self.clip._callbacks["notes"][0]
        self.registry.unwatch("w1")
        late()

        self.assertEqual(self.events(), [])

    def test_a_late_callback_after_close_is_ignored(self):
        self.watch()
        late = self.clip._callbacks["notes"][0]
        self.registry.close()
        late()

        self.assertEqual(self.events(), [])

    def test_a_late_callback_after_the_clip_went_gone_is_ignored(self):
        self.watch()
        late = self.clip._callbacks["notes"][0]
        self.slot.delete_clip()
        self.read(0)
        late()

        self.assertEqual(self.events(1), [])


class GoneTest(RegistryCase):
    """A deleted clip stays gone. Nothing re-binds into the slot."""

    def test_deleting_reports_gone_once_with_the_last_path_and_a_reason(self):
        self.watch()
        self.slot.delete_clip()
        first = self.read(0)
        again = self.read(first["seq"])

        self.assertEqual(
            first["events"],
            [
                {
                    "seq": 1,
                    "owner": "w1",
                    "kind": "gone",
                    "fields": ["clip"],
                    "path": "t0/s0",
                    "reason": "dead",
                }
            ],
        )
        self.assertEqual(again["events"], [])

    def test_a_clip_put_in_the_slot_afterwards_is_not_picked_up(self):
        self.watch()
        self.slot.delete_clip()
        self.read(0)
        newcomer = FakeClip("New")
        self.slot.put(newcomer)
        reply = self.read(1)

        self.assertEqual(reply["events"], [])
        self.assertEqual(reply["watching"], [])
        self.assertEqual(newcomer.listeners(), 0)

    def test_replacing_the_clip_while_the_old_object_survives(self):
        self.watch()
        newcomer = FakeClip("New")
        self.slot.put(newcomer)  # the old object stays valid, now orphaned
        reply = self.read(0)

        self.assertEqual(reply["events"][0]["kind"], "gone")
        self.assertEqual(reply["events"][0]["reason"], "replaced")
        self.assertEqual(newcomer.listeners(), 0)
        self.assertEqual(self.clip.listeners(), 0)

    def test_a_slot_emptied_without_the_clip_dying(self):
        self.watch()
        self.slot._clip = None
        reply = self.read(0)

        self.assertEqual(reply["events"][0]["reason"], "emptied")

    def test_a_watch_on_a_dead_object_is_gone(self):
        self.watch()
        self.clip.die()
        reply = self.read(0)

        self.assertEqual(reply["events"][0]["kind"], "gone")
        self.assertEqual(reply["watching"], [])

    def test_a_clip_with_no_slot_parent_is_gone(self):
        self.watch()
        self.clip._slot = types.SimpleNamespace(
            canonical_parent=None, has_clip=False
        )
        reply = self.read(0)

        self.assertEqual(reply["events"][0]["kind"], "gone")

    def test_a_slot_whose_clip_is_another_one_is_replaced(self):
        self.watch()
        self.slot._clip = FakeClip("Other")  # the bound clip still points here
        reply = self.read(0)

        self.assertEqual(reply["events"][0]["reason"], "replaced")

    def test_a_track_that_left_the_set_is_unlocated(self):
        self.watch()
        self.song.tracks.clear()
        reply = self.read(0)

        self.assertEqual(reply["events"][0]["reason"], "unlocated")


class DescribeTest(RegistryCase):
    def test_it_lists_every_watch_and_what_became_of_it(self):
        self.watch()
        self.slot.delete_clip()
        self.read(0)

        info = self.registry.describe()["watches"]

        self.assertEqual(
            info,
            [
                {
                    "owner": "w1",
                    "state": "gone",
                    "path": "t0/s0",
                    "listeners": 0,
                    "reason": "dead",
                    "old_object_valid_again": False,
                }
            ],
        )

    def test_a_gone_clip_whose_object_comes_back_is_noted_and_not_acted_on(self):
        self.watch()
        self.clip._slot = types.SimpleNamespace(canonical_parent=None, has_clip=False)
        self.read(0)
        # Live gives the object back: valid, in a slot that holds it.
        self.clip._slot = self.slot
        reply = self.read(1)
        info = self.registry.describe()["watches"][0]

        self.assertTrue(info["old_object_valid_again"])
        self.assertEqual(info["state"], "gone")
        self.assertEqual(reply["watching"], [])
        self.assertEqual(reply["events"], [])
        self.assertTrue(any("valid again" in line for line in self.logged))

    def test_a_live_watch_describes_itself(self):
        self.watch()

        self.assertEqual(
            self.registry.describe()["watches"],
            [
                {
                    "owner": "w1",
                    "state": "watching",
                    "path": "t0/s0",
                    "listeners": len(watches.CLIP_PROPERTIES),
                }
            ],
        )


class MoveTest(RegistryCase):
    def test_a_track_inserted_before_moves_the_path_and_keeps_the_clip(self):
        self.watch()
        self.song.tracks.insert(0, FakeTrack([FakeSlot()]))
        reply = self.read(0)

        self.assertEqual(
            reply["events"],
            [
                {
                    "seq": 1,
                    "owner": "w1",
                    "kind": "moved",
                    "fields": ["path"],
                    "path": "t1/s0",
                    "fingerprint": {"name": "Bass", "length": 8.0},
                }
            ],
        )
        self.assertEqual(reply["watching"], ["w1"])
        self.assertEqual(self.clip.listeners(), len(watches.CLIP_PROPERTIES))

    def test_the_new_path_does_not_point_at_the_empty_slot_that_took_the_old_one(self):
        self.watch()
        fresh = FakeSlot()
        self.song.tracks.insert(0, FakeTrack([fresh]))
        self.read(0)

        self.assertEqual(self.registry.describe()["watches"][0]["path"], "t1/s0")
        self.assertEqual(self.registry.owners(), ["w1"])

    def test_a_deleted_track_before_it_moves_the_path_down(self):
        second = FakeSlot(FakeClip("Second"))
        song = song_with([FakeSlot()], [second])
        self.registry.watch(song, "w1", 1, 0)
        song.tracks.pop(0)
        reply = self.read(0, song=song)

        self.assertEqual(reply["events"][0]["path"], "t0/s0")

    def test_scenes_inserted_before_move_the_slot_index(self):
        song = song_with([self.slot])
        self.registry.watch(song, "w1", 0, 0)
        new_slot = FakeSlot()
        new_slot._track = song.tracks[0]
        song.tracks[0].clip_slots.insert(0, new_slot)
        reply = self.read(0, song=song)

        self.assertEqual(reply["events"][0]["path"], "t0/s1")

    def test_tracks_reordered(self):
        other = FakeSlot(FakeClip("Other"))
        song = song_with([self.slot], [other])
        self.registry.watch(song, "w1", 0, 0)
        song.tracks.reverse()
        reply = self.read(0, song=song)

        self.assertEqual(reply["events"][0]["path"], "t1/s0")

    def test_a_clip_moved_to_another_slot_by_live_keeps_the_watch(self):
        target = FakeSlot()
        song = song_with([self.slot, target])
        self.registry.watch(song, "w1", 0, 0)
        move_clip(self.clip, target)
        reply = self.read(0, song=song)

        self.assertEqual(reply["events"][0]["kind"], "moved")
        self.assertEqual(reply["events"][0]["path"], "t0/s1")
        self.assertEqual(self.clip.listeners(), len(watches.CLIP_PROPERTIES))

    def test_the_moved_clip_is_still_heard(self):
        target = FakeSlot()
        song = song_with([self.slot, target])
        self.registry.watch(song, "w1", 0, 0)
        move_clip(self.clip, target)
        seq = self.read(0, song=song)["seq"]
        self.clip.fire("notes")

        events = self.events(seq, song=song)

        self.assertEqual(events[0]["kind"], "changed")
        self.assertEqual(events[0]["path"], "t0/s1")

    def test_a_clip_that_did_not_move_costs_no_event(self):
        self.watch()

        self.assertEqual(self.events(), [])
        self.assertEqual(self.events(), [])

    def test_a_move_and_a_note_edit_in_one_tick_are_one_event(self):
        self.watch()
        self.clip.fire("notes")
        self.song.tracks.insert(0, FakeTrack([FakeSlot()]))
        events = self.events()

        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["kind"], "moved")
        self.assertEqual(events[0]["fields"], ["notes", "path"])


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
        events = self.events()

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
        other.clip.fire("name")
        events = self.registry.read(song, 0)["events"]

        self.assertEqual(
            [(e["seq"], e["owner"]) for e in events], [(1, "a"), (2, "b")]
        )

    def test_a_stronger_change_wins_within_one_event(self):
        self.watch()
        self.clip.fire("notes")
        self.slot.delete_clip()
        events = self.events()

        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["kind"], "gone")

    def test_a_changed_event_carries_the_clips_current_fingerprint(self):
        self.watch()
        self.clip._name = "Bass2"
        self.clip._length = 16.0
        self.clip.fire("name")
        events = self.events()

        self.assertEqual(events[0]["fingerprint"], {"name": "Bass2", "length": 16.0})

    def test_a_gone_event_has_no_fingerprint(self):
        self.watch()
        self.slot.delete_clip()
        events = self.events()

        self.assertEqual(events[0]["kind"], "gone")
        self.assertNotIn("fingerprint", events[0])

    def test_a_clip_that_dies_between_the_check_and_the_read_still_flushes(self):
        self.watch()
        self.clip.fire("notes")
        with mock.patch.object(watches, "_fingerprint", side_effect=RuntimeError):
            events = self.events()

        self.assertEqual(events[0]["kind"], "changed")
        self.assertNotIn("fingerprint", events[0])

    def test_a_reader_gets_only_what_is_after_its_position(self):
        self.watch()
        self.clip.fire("notes")
        first = self.read(0)
        self.clip.fire("name")
        later = self.read(first["seq"])

        self.assertEqual([e["seq"] for e in first["events"]], [1])
        self.assertEqual([e["seq"] for e in later["events"]], [2])
        self.assertEqual(self.read(later["seq"])["events"], [])

    def test_a_read_that_fails_is_logged_and_does_not_end_the_read(self):
        self.watch()
        self.slot._track = None  # the clip's slot has no track
        reply = self.read(0)

        self.assertEqual(reply["events"][0]["kind"], "gone")


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
        self.clip = FakeClip("Bass", 8.0)
        self.slot = FakeSlot(self.clip)
        self.bridge = types.SimpleNamespace(
            song=song_with([self.slot]), log=lambda message: None
        )

    def call(self, name, **params):
        return routes.ROUTES[name](self.bridge, params)

    def test_watch_then_events_then_unwatch(self):
        reply = self.call("/watch", owner="w1", path="t0/s0")
        self.assertEqual(reply["fingerprint"], {"name": "Bass", "length": 8.0})
        self.clip.fire("notes")

        events = self.call("/events", since="0")
        self.assertEqual(events["events"][0]["owner"], "w1")
        self.assertEqual(self.call("/unwatch", owner="w1"), {"existed": True})
        self.assertEqual(self.clip.listeners(), 0)

    def test_the_registry_lives_on_the_bridge(self):
        self.call("/watch", owner="w1", path="t0/s0")

        self.assertIs(self.bridge.watches, watches._registry(self.bridge))

    def test_the_fingerprint_is_checked(self):
        with self.assertRaises(RouteError) as caught:
            self.call(
                "/watch",
                owner="w1",
                path="t0/s0",
                fingerprint={"name": "Other", "length": 8.0},
            )
        self.assertEqual(caught.exception.payload["reason"], "mismatch")

    def test_the_diagnostic_route_lists_watches(self):
        self.call("/watch", owner="w1", path="t0/s0")

        self.assertEqual(self.call("/watches")["watches"][0]["owner"], "w1")

    def test_bad_input_is_a_400(self):
        for params in (
            {"path": "t0/s0"},
            {"owner": "", "path": "t0/s0"},
            {"owner": "w1", "path": "t0"},
            {"owner": "w1", "path": "t0/s0/x"},
            {"owner": "w1", "path": "t0/s0", "fingerprint": "Bass"},
            {"owner": "w1", "path": "t0/s0", "fingerprint": {"name": "B"}},
            {"owner": "w1", "path": "t0/s0", "fingerprint": {"name": "B", "length": True}},
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
        self.assertNotIn("/watches", routes.POST_ONLY)


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
        surface.cleanups = {}
        surface.log = lambda message: None
        return surface

    def registry_with_a_watch(self, surface):
        """The bridge's registry, made the way the routes make it."""
        clip = FakeClip()
        registry = watches._registry(surface)
        registry.watch(song_with([FakeSlot(clip)]), "w1", 0, 0)
        return registry, clip

    def test_disconnecting_removes_every_listener(self):
        surface = self.make_bridge()
        _, clip = self.registry_with_a_watch(surface)
        surface.disconnect()

        self.assertEqual(clip.listeners(), 0)
        self.assertIsNone(surface.watches)
        surface._server.stop.assert_called_once()

    def test_disconnecting_survives_a_registry_that_fails_to_close(self):
        surface = self.make_bridge()
        watches._registry(surface).close = mock.Mock(side_effect=RuntimeError("x"))
        surface.disconnect()

        surface._server.stop.assert_called_once()

    def test_disconnecting_with_no_watches_is_fine(self):
        self.make_bridge().disconnect()

    def test_a_hot_reload_removes_every_listener_first(self):
        surface = self.make_bridge()
        _, clip = self.registry_with_a_watch(surface)
        order = []

        def reload():
            order.append(clip.listeners())
            return ["watches"], "abc123abc123"

        with mock.patch.object(hot_reload, "reload_implementation", reload):
            hot_reload.reload_route(surface, {})

        self.assertEqual(order, [0])
        self.assertIsNone(surface.watches)

    def test_a_failed_reload_has_still_released_the_watches(self):
        surface = self.make_bridge()
        _, clip = self.registry_with_a_watch(surface)
        failure = hot_reload.ReloadError("watches", "trace")

        with mock.patch.object(hot_reload, "reload_implementation", side_effect=failure):
            with self.assertRaises(RouteError):
                hot_reload.reload_route(surface, {})

        self.assertEqual(clip.listeners(), 0)


if __name__ == "__main__":
    unittest.main()
