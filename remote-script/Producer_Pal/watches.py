# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""Live listeners on Session clips, for the generative UI panel. Main thread only.

A watch is one owner (a widget id) bound to one clip OBJECT, taken from the slot
the path names when the watch starts. It follows that object, not the slot:

- If the clip moves (tracks or scenes inserted, deleted or reordered, or Live
  moves the clip), the watch reports "moved" with the new path.
- If the clip is deleted, replaced or its object dies, the watch reports "gone"
  once and stays gone. It never re-binds to whatever lands in the slot later.

Where a clip is comes from its parents (clip -> slot -> track) and their
indices. Live's change callbacks only mark a watch; each read checks every
watch against the Set, so a move or delete is noticed even if no callback fired.

A watch on an empty slot is refused. A watch may carry a fingerprint (clip name
and length) from an earlier session: if the clip at the path doesn't match, it
is refused too, since the old object is gone and this is some other clip.

Every listener is removed when the watch ends or goes gone, the Set changes,
the registry is closed (script disconnect), or a hot reload begins (see
`hot_reload.reload_route`). A late callback from a removed watch is ignored.

Events are coalesced (many callbacks between two reads become one event per
watch) and kept in a ring of MAX_EVENTS. A reader that falls further behind than
the ring gets `resync: true` and no events, and must refresh everything.
"""

import re
import secrets
import threading
from collections import deque

from .errors import RouteError
from .params import parse_index

# Most watches at once, gone ones included until they are unwatched. Each live
# one holds about ten listeners.
MAX_WATCHES = 32

# Events kept for readers. Past this, the oldest are dropped.
MAX_EVENTS = 256

# What changes about a clip. Live has no listener for "length": it follows from
# the loop and marker properties.
CLIP_PROPERTIES = (
    "notes",
    "name",
    "color",
    "loop_start",
    "loop_end",
    "start_marker",
    "end_marker",
    "looping",
    "signature_numerator",
    "signature_denominator",
)

# When one owner has several marks before a read, the strongest decides.
_KIND_RANK = {"changed": 0, "moved": 1, "gone": 2}

# How far two lengths (in beats) may differ and still be the same clip.
_LENGTH_TOLERANCE = 1e-4

_SLOT_PATH = re.compile(r"t(\d+)/s(\d+)")


class WatchRegistry:
    """The watches, their events, and every listener that backs them."""

    def __init__(self, log=None, max_watches=MAX_WATCHES, max_events=MAX_EVENTS):
        self._log = log or (lambda message: None)
        self._max_watches = max_watches
        self._max_events = max_events
        # A listener callback and a read are both main-thread, but a lock costs
        # nothing and keeps a stray thread from tearing the queue.
        self._lock = threading.RLock()
        self._song = None
        self._watches = {}
        self._pending = {}
        self._events = deque()
        self._seq = 0
        # Changes whenever the registry forgets everything, so a reader knows
        # its sequence numbers and its watches no longer mean anything.
        self.epoch = secrets.token_hex(4)

    # --- the API the routes use ----------------------------------------

    def watch(self, song, owner, track_index, slot_index, fingerprint=None):
        """Start (or replace) `owner`'s watch on the clip at a slot."""
        with self._lock:
            self._check_song(song)
            slot = _slot_at(song, track_index, slot_index)
            if slot is None:
                raise RouteError(
                    404, "no slot t%s/s%s" % (track_index, slot_index), reason="no_slot"
                )
            clip = _clip_of(slot)
            if clip is None:
                raise RouteError(
                    404,
                    "slot t%s/s%s is empty" % (track_index, slot_index),
                    reason="empty",
                )
            found = _fingerprint(clip)
            if fingerprint is not None and not _matches(fingerprint, found):
                raise RouteError(
                    409,
                    "the clip at t%s/s%s isn't the one this watched before"
                    % (track_index, slot_index),
                    reason="mismatch",
                    found=found,
                )
            taken = len(self._watches) - (1 if owner in self._watches else 0)
            if taken >= self._max_watches:
                raise RouteError(
                    409,
                    "watch limit of %d reached; unwatch one first" % self._max_watches,
                    reason="limit",
                    limit=self._max_watches,
                )
            self._remove(owner)
            entry = _Watch(owner, clip, track_index, slot_index)
            self._watches[owner] = entry
            entry.bindings = self._attach_all(entry, clip)
            return {
                "ok": True,
                "owner": owner,
                "path": entry.path(),
                "fingerprint": found,
                "epoch": self.epoch,
                "seq": self._seq,
            }

    def unwatch(self, owner):
        """Stop `owner`'s watch. Returns whether there was one."""
        with self._lock:
            existed = owner in self._watches
            self._remove(owner)
            return existed

    def read(self, song, since=None):
        """Events after sequence `since`, or the current position when `since` is None."""
        with self._lock:
            self._check_song(song)
            self._flush(song)
            return self._reply(since)

    def close(self):
        """Remove every listener and forget everything."""
        with self._lock:
            self._reset()

    def owners(self):
        """The owners being watched (not the gone ones), sorted."""
        with self._lock:
            return sorted(o for o, w in self._watches.items() if w.state == "watching")

    def listener_count(self):
        """How many Live listeners are attached. For tests and diagnostics."""
        with self._lock:
            return sum(len(w.bindings) for w in self._watches.values())

    def describe(self):
        """Every watch and what became of it, for working out how Live behaves."""
        with self._lock:
            return {
                "epoch": self.epoch,
                "seq": self._seq,
                "watches": [w.describe() for w in self._watches.values()],
            }

    # --- reading ---------------------------------------------------------

    def _reply(self, since):
        if since is None:
            events, resync = [], False
        else:
            oldest = self._events[0]["seq"] if self._events else self._seq + 1
            resync = since > self._seq or since < oldest - 1
            events = (
                []
                if resync
                else [dict(e) for e in self._events if e["seq"] > since]
            )
        return {
            "epoch": self.epoch,
            "seq": self._seq,
            "resync": resync,
            "events": events,
            "watching": self.owners(),
        }

    def _flush(self, song):
        """Check every watch against the Set, then turn marks into events."""
        for entry in list(self._watches.values()):
            if self._watches.get(entry.owner) is not entry:
                continue
            try:
                if entry.state == "watching":
                    self._verify(song, entry)
                else:
                    self._probe(entry)
            except Exception as err:
                self._log("watch %s: %s: %s" % (entry.owner, type(err).__name__, err))
        pending, self._pending = self._pending, {}
        for owner, mark in pending.items():
            self._seq += 1
            event = {
                "seq": self._seq,
                "owner": owner,
                "kind": mark["kind"],
                "fields": sorted(mark["fields"]),
            }
            if mark.get("path"):
                event["path"] = mark["path"]
            if mark.get("reason"):
                event["reason"] = mark["reason"]
            self._events.append(event)
        while len(self._events) > self._max_events:
            self._events.popleft()

    def _verify(self, song, entry):
        """Is the clip still in a slot, and which one? Reading a dead object raises."""
        try:
            slot = entry.clip.canonical_parent
            track = slot.canonical_parent
            has_clip = slot.has_clip
            same_clip = has_clip and _same(slot.clip, entry.clip)
        except Exception:
            self._gone(entry, "dead")
            return
        if not has_clip:
            self._gone(entry, "emptied")
            return
        if not same_clip:
            self._gone(entry, "replaced")
            return
        located = _locate(song, track, slot, entry.track_index, entry.slot_index)
        if located is None:
            self._gone(entry, "unlocated")
            return
        if located != (entry.track_index, entry.slot_index):
            entry.track_index, entry.slot_index = located
            self._mark(entry, "moved", "path")

    def _gone(self, entry, reason):
        """The clip is no more. Stop listening; the entry stays until unwatched."""
        self._log("watch %s: %s is gone (%s)" % (entry.owner, entry.path(), reason))
        _detach_all(entry.bindings)
        entry.bindings = []
        entry.state = "gone"
        entry.reason = reason
        entry.old_clip, entry.clip = entry.clip, None
        self._mark(entry, "gone", "clip", reason=reason)

    def _probe(self, entry):
        """Note whether a gone clip's object has come back valid. Only observed:
        the watch stays gone either way."""
        try:
            slot = entry.old_clip.canonical_parent
            valid = bool(slot.has_clip and _same(slot.clip, entry.old_clip))
        except Exception:
            valid = False
        if valid and not entry.revived:
            self._log("watch %s: the old clip object is valid again" % entry.owner)
        entry.revived = valid

    # --- listeners ---------------------------------------------------------

    def _attach_all(self, entry, clip):
        bindings = []
        for prop in CLIP_PROPERTIES:
            callback = self._callback(entry, prop)
            try:
                binding = _attach(clip, prop, callback)
            except Exception as err:
                self._log("cannot listen to %s: %s" % (prop, err))
                continue
            if binding is not None:
                bindings.append(binding)
        return bindings

    def _callback(self, entry, prop):
        def on_change(*args):
            with self._lock:
                # A callback that outlives its watch (or arrives while it is
                # being removed) is not news.
                if self._watches.get(entry.owner) is entry and entry.state == "watching":
                    self._mark(entry, "changed", prop)

        return on_change

    def _mark(self, entry, kind, field, reason=None):
        mark = self._pending.setdefault(
            entry.owner, {"kind": kind, "fields": set(), "path": None, "reason": None}
        )
        if _KIND_RANK[kind] > _KIND_RANK[mark["kind"]]:
            mark["kind"] = kind
        mark["fields"].add(field)
        mark["path"] = entry.path()
        if reason:
            mark["reason"] = reason

    def _remove(self, owner):
        entry = self._watches.pop(owner, None)
        self._pending.pop(owner, None)
        if entry is not None:
            _detach_all(entry.bindings)
            entry.bindings = []

    def _check_song(self, song):
        if self._song is not None and not _same(self._song, song):
            self._log("the Live Set changed; dropping every watch")
            self._reset()
        self._song = song

    def _reset(self):
        for owner in list(self._watches):
            self._remove(owner)
        self._pending = {}
        self._events.clear()
        self._seq = 0
        self._song = None
        self.epoch = secrets.token_hex(4)


class _Watch:
    def __init__(self, owner, clip, track_index, slot_index):
        self.owner = owner
        self.clip = clip
        self.track_index = track_index
        self.slot_index = slot_index
        self.bindings = []
        # "watching", or "gone" once the clip is deleted, replaced or dead.
        self.state = "watching"
        self.reason = None
        # The gone clip's object, kept only to see whether it ever comes back.
        self.old_clip = None
        self.revived = False

    def path(self):
        return "t%s/s%s" % (self.track_index, self.slot_index)

    def describe(self):
        info = {
            "owner": self.owner,
            "state": self.state,
            "path": self.path(),
            "listeners": len(self.bindings),
        }
        if self.state == "gone":
            info["reason"] = self.reason
            info["old_object_valid_again"] = self.revived
        return info


# --- Live helpers ---------------------------------------------------------


def _slot_at(song, track_index, slot_index):
    """The slot at a position, or None when no track or slot is there."""
    tracks = song.tracks
    if track_index >= len(tracks):
        return None
    slots = tracks[track_index].clip_slots
    if slot_index >= len(slots):
        return None
    return slots[slot_index]


def _clip_of(slot):
    """The clip in a slot, or None when it is empty."""
    return slot.clip if slot.has_clip else None


def _locate(song, track, slot, track_index, slot_index):
    """(track index, slot index) of a slot, or None when it isn't in this Set.

    Tries the last known position first, so a clip that hasn't moved costs two
    lookups instead of a scan.
    """
    tracks = song.tracks
    if track_index < len(tracks) and _same(tracks[track_index], track):
        ti = track_index
    else:
        ti = _index_of(tracks, track)
    if ti is None:
        return None
    slots = tracks[ti].clip_slots
    if slot_index < len(slots) and _same(slots[slot_index], slot):
        return ti, slot_index
    si = _index_of(slots, slot)
    return None if si is None else (ti, si)


def _index_of(items, target):
    for i, item in enumerate(items):
        if _same(item, target):
            return i
    return None


def _fingerprint(clip):
    """What identifies a clip across sessions, when object identity is gone."""
    return {"name": clip.name, "length": float(clip.length)}


def _matches(expected, found):
    return (
        expected.get("name") == found["name"]
        and abs(float(expected.get("length", -1)) - found["length"]) <= _LENGTH_TOLERANCE
    )


def _same(a, b):
    """Whether two Live objects are the same one. Wrappers are rebuilt, so `is` isn't enough."""
    if a is None or b is None:
        return a is b
    if a is b:
        return True
    pointer_a = getattr(a, "_live_ptr", None)
    pointer_b = getattr(b, "_live_ptr", None)
    if pointer_a is not None and pointer_b is not None:
        return pointer_a == pointer_b
    return bool(a == b)


def _attach(obj, prop, callback):
    """Listen to one property. None when this Live has no such listener."""
    add = getattr(obj, "add_%s_listener" % prop, None)
    if add is None:
        return None
    add(callback)
    return (obj, prop, callback)


def _detach_all(bindings):
    for binding in bindings:
        _detach(binding)


def _detach(binding):
    """Remove one listener. A dead object took its listeners with it, so a failure is fine."""
    obj, prop, callback = binding
    try:
        has_listener = getattr(obj, "%s_has_listener" % prop, None)
        if has_listener is not None and not has_listener(callback):
            return
        getattr(obj, "remove_%s_listener" % prop)(callback)
    except Exception:
        pass


# --- routes -----------------------------------------------------------------


def _registry(bridge):
    """The bridge's registry, made on first use. It lives on the bridge, which
    Live replaces with each Set, and which a hot reload keeps."""
    registry = getattr(bridge, "watches", None)
    if registry is None:
        registry = WatchRegistry(log=bridge.log)
        bridge.watches = registry
    return registry


def watch_route(bridge, params):
    """`POST /watch`: `owner`, `path` ("t0/s3") and optional `fingerprint`
    ({name, length}) from an earlier session."""
    owner = _owner(params)
    match = _SLOT_PATH.fullmatch(str(params.get("path") or ""))
    if not match:
        raise RouteError(400, "path must be a Session slot like t0/s3")
    return _registry(bridge).watch(
        bridge.song,
        owner,
        int(match[1]),
        int(match[2]),
        _fingerprint_param(params.get("fingerprint")),
    )


def unwatch_route(bridge, params):
    """`POST /unwatch`: `owner`."""
    return {"existed": _registry(bridge).unwatch(_owner(params))}


def events_route(bridge, params):
    """`GET /events?since=N`: what changed since sequence N, or just the position."""
    since = parse_index(params.get("since"), "since")
    return _registry(bridge).read(bridge.song, since)


def watches_route(bridge, params):
    """`GET /watches`: every watch and its state, for diagnosis."""
    return _registry(bridge).describe()


def _fingerprint_param(value):
    if value is None:
        return None
    if (
        not isinstance(value, dict)
        or not isinstance(value.get("name"), str)
        or isinstance(value.get("length"), bool)
        or not isinstance(value.get("length"), (int, float))
    ):
        raise RouteError(400, "fingerprint must be {name: string, length: number}")
    return value


def _owner(params):
    owner = params.get("owner")
    if not isinstance(owner, str) or not owner.strip():
        raise RouteError(400, "owner must be a non-empty string")
    return owner.strip()


ROUTES = {
    "/watch": watch_route,
    "/unwatch": unwatch_route,
    "/events": events_route,
    "/watches": watches_route,
}

# Routes that start or stop a watch refuse GET.
POST_ONLY = ("/watch", "/unwatch")
