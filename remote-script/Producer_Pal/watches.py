# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""Live listeners on Session clips, for the generative UI panel. Main thread only.

A watch is one owner (a widget id) following one clip slot. Live's own change
callbacks only mark the watch as changed. The events route (`read`) turns marks
into events, and also checks each watch against the Set, so a clip that was
replaced, moved or deleted is noticed even if no callback fired.

Two kinds of watch:
- follow (default): the slot at a position. If another clip lands there, or
  tracks shift so another slot sits there, the watch re-binds and reports it.
- pinned (follow=False): one clip object. If it is replaced or dies, the watch
  reports "gone" once and removes itself.

Every listener is removed when: the watch is removed, its object dies, the Set
changes (a new song object), the registry is closed (script disconnect), or a
hot reload begins (see `hot_reload.reload_route`). A late callback from a
removed watch is ignored.

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

# Most watches at once. Each holds about ten listeners.
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

# What changes about a slot.
SLOT_PROPERTIES = ("has_clip",)

# When one owner has several marks before a read, the strongest decides.
_KIND_RANK = {"changed": 0, "rebound": 1, "gone": 2}

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

    def watch(self, song, owner, track_index, slot_index, follow=True):
        """Start (or replace) `owner`'s watch on a slot. Returns whether it has a clip."""
        with self._lock:
            self._check_song(song)
            slot = _slot_at(song, track_index, slot_index)
            if slot is None:
                raise RouteError(
                    404, "no slot t%s/s%s" % (track_index, slot_index)
                )
            if not follow and _clip_of(slot) is None:
                raise RouteError(
                    404, "slot t%s/s%s is empty" % (track_index, slot_index)
                )
            self._remove(owner)
            if len(self._watches) >= self._max_watches:
                raise RouteError(
                    409,
                    "watch limit of %d reached; unwatch one first" % self._max_watches,
                    limit=self._max_watches,
                )
            entry = _Watch(owner, track_index, slot_index, follow)
            self._watches[owner] = entry
            self._bind_slot(entry, slot)
            return {
                "ok": True,
                "owner": owner,
                "has_clip": entry.clip is not None,
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
        """The owners being watched, sorted."""
        with self._lock:
            return sorted(self._watches)

    def listener_count(self):
        """How many Live listeners are attached. For tests and diagnostics."""
        with self._lock:
            return sum(
                len(w.slot_bindings) + len(w.clip_bindings)
                for w in self._watches.values()
            )

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
            "watching": sorted(self._watches),
        }

    def _flush(self, song):
        """Check every watch against the Set, then turn marks into events."""
        for entry in list(self._watches.values()):
            if self._watches.get(entry.owner) is not entry:
                continue
            try:
                self._verify(song, entry)
            except Exception as err:
                # Something we can't read is something that isn't there.
                self._log("watch %s: %s: %s" % (entry.owner, type(err).__name__, err))
                if entry.follow:
                    self._mark(entry, "rebound", "error")
                else:
                    self._remove(entry.owner)
                    self._pending[entry.owner] = ["gone", {"error"}]
        pending, self._pending = self._pending, {}
        for owner, (kind, fields) in pending.items():
            self._seq += 1
            self._events.append(
                {
                    "seq": self._seq,
                    "owner": owner,
                    "kind": kind,
                    "fields": sorted(fields),
                }
            )
        while len(self._events) > self._max_events:
            self._events.popleft()

    def _verify(self, song, entry):
        if entry.follow:
            self._verify_following(song, entry)
        else:
            self._verify_pinned(entry)

    def _verify_following(self, song, entry):
        slot = _slot_at(song, entry.track_index, entry.slot_index)
        if not _same(slot, entry.slot):
            self._bind_slot(entry, slot)
            self._mark(entry, "rebound", "slot")
            return
        clip = _clip_of(slot)
        if not _same(clip, entry.clip):
            self._bind_clip(entry, clip)
            self._mark(entry, "rebound", "has_clip")

    def _verify_pinned(self, entry):
        # Reading a dead object raises, which `_flush` treats as gone.
        clip = _clip_of(entry.slot)
        if entry.clip is None or not _same(clip, entry.clip):
            self._remove(entry.owner)
            self._pending[entry.owner] = ["gone", {"has_clip"}]

    # --- listeners ---------------------------------------------------------

    def _bind_slot(self, entry, slot):
        """Point the watch at a slot (or at nothing) and its clip."""
        _detach_all(entry.slot_bindings)
        entry.slot = slot
        entry.slot_bindings = []
        if slot is not None:
            entry.slot_bindings = self._attach_all(entry, slot, SLOT_PROPERTIES)
        self._bind_clip(entry, _clip_of(slot))

    def _bind_clip(self, entry, clip):
        _detach_all(entry.clip_bindings)
        entry.clip = clip
        entry.clip_bindings = []
        if clip is not None:
            entry.clip_bindings = self._attach_all(entry, clip, CLIP_PROPERTIES)

    def _attach_all(self, entry, obj, properties):
        bindings = []
        for prop in properties:
            callback = self._callback(entry, prop)
            try:
                binding = _attach(obj, prop, callback)
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
                if self._watches.get(entry.owner) is entry:
                    self._mark(entry, "changed", prop)

        return on_change

    def _mark(self, entry, kind, field):
        mark = self._pending.setdefault(entry.owner, [kind, set()])
        if _KIND_RANK[kind] > _KIND_RANK[mark[0]]:
            mark[0] = kind
        mark[1].add(field)

    def _remove(self, owner):
        entry = self._watches.pop(owner, None)
        self._pending.pop(owner, None)
        if entry is not None:
            _detach_all(entry.slot_bindings)
            _detach_all(entry.clip_bindings)
            entry.slot_bindings = []
            entry.clip_bindings = []

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
    def __init__(self, owner, track_index, slot_index, follow):
        self.owner = owner
        self.track_index = track_index
        self.slot_index = slot_index
        self.follow = follow
        self.slot = None
        self.clip = None
        self.slot_bindings = []
        self.clip_bindings = []


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
    """The clip in a slot, or None when it is empty or there is no slot."""
    if slot is None or not slot.has_clip:
        return None
    return slot.clip


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
    """`POST /watch`: `owner`, `path` ("t0/s3") and optional `follow` (default true)."""
    owner = _owner(params)
    match = _SLOT_PATH.fullmatch(str(params.get("path") or ""))
    if not match:
        raise RouteError(400, "path must be a Session slot like t0/s3")
    follow = str(params.get("follow", True)).strip().lower() not in (
        "0",
        "false",
        "no",
        "off",
    )
    return _registry(bridge).watch(
        bridge.song, owner, int(match[1]), int(match[2]), follow
    )


def unwatch_route(bridge, params):
    """`POST /unwatch`: `owner`."""
    return {"existed": _registry(bridge).unwatch(_owner(params))}


def events_route(bridge, params):
    """`GET /events?since=N`: what changed since sequence N, or just the position."""
    since = parse_index(params.get("since"), "since")
    return _registry(bridge).read(bridge.song, since)


def _owner(params):
    owner = params.get("owner")
    if not isinstance(owner, str) or not owner.strip():
        raise RouteError(400, "owner must be a non-empty string")
    return owner.strip()


ROUTES = {
    "/watch": watch_route,
    "/unwatch": unwatch_route,
    "/events": events_route,
}

# Routes that start or stop a watch refuse GET.
POST_ONLY = ("/watch", "/unwatch")
