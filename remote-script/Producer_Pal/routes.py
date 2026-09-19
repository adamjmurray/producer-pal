# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: GPL-3.0-or-later

"""What the HTTP routes do. Every function here runs on Live's main thread."""

from . import browser
from .version import VERSION

# A new track's type follows what's being loaded. When that's unknown (plugins),
# use MIDI: Live refuses an instrument on an audio track and makes a track of
# its own. Clients that know a plugin is an effect pass track_type.
TRACK_TYPE_FOR_KIND = {
    "instrument": "midi",
    "midi-effect": "midi",
    "audio-effect": "audio",
}
UNKNOWN_KIND_TRACK_TYPE = "midi"

# These types are named after the kind of device they hold.
KIND_TYPES = ("audio-effect", "instrument", "midi-effect")

# In the Max for Live section, the top folder says what a device is.
MFL_FOLDER_KINDS = {
    "Max Audio Effect": "audio-effect",
    "Max Instrument": "instrument",
    "Max MIDI Effect": "midi-effect",
}

# A Live Set can only have one Producer Pal device.
PRODUCER_PAL_NAME = "producer_pal"

# Plugins often exist as AU, VST and VST3 under the same name, so ambiguity is
# normal - report the candidates instead of guessing.
MAX_CANDIDATES = 25
MAX_CHOICES = 50


class RouteError(Exception):
    """A route's own HTTP status and body."""

    def __init__(self, status, message, **extra):
        super().__init__(message)
        self.status = status
        self.payload = dict(extra, error=message)


def ping(bridge, params):
    app = bridge.app
    version = "%s.%s.%s" % (
        app.get_major_version(),
        app.get_minor_version(),
        app.get_bugfix_version(),
    )
    return {"ok": True, "live_version": version, "script_version": VERSION}


def list_items(bridge, params):
    item_type = params.get("type")
    root, devices_only = _type_root(bridge, item_type)
    start, start_path = _resolve(root, params.get("path"))
    query = params.get("q")

    if _as_bool(params.get("recursive", True)):
        items = browser.list_loadable(start, start_path, devices_only, query)
    else:
        items = browser.list_children(start, start_path, query)

    return {"type": item_type, "path": start_path, "count": len(items), "items": items}


def load(bridge, params):
    item_type = params.get("type")
    root, devices_only = _type_root(bridge, item_type)
    item, path = _find_loadable(root, devices_only, params)
    kind = _item_kind(item_type, path)
    song = bridge.song

    if _is_producer_pal(item.name):
        _refuse_second_producer_pal(song)

    default_track_type = TRACK_TYPE_FOR_KIND.get(kind, UNKNOWN_KIND_TRACK_TYPE)
    track = _target_track(song, params, default_track_type)

    # load_item loads into whatever track is selected, so select it first.
    song.view.selected_track = track
    bridge.app.browser.load_item(item)

    return {
        "loaded": {"name": item.name, "path": path, "kind": kind},
        "track": {"index": list(song.tracks).index(track), "name": track.name},
        # Plugins and Max devices finish loading asynchronously, so this list
        # can lag a request behind.
        "devices": [device.name for device in track.devices],
    }


def _is_producer_pal(name):
    """True for the Producer Pal device, any case, with or without .amxd."""
    text = str(name or "").strip().lower()
    if text.endswith(".amxd"):
        text = text[: -len(".amxd")]
    return text == PRODUCER_PAL_NAME


def _refuse_second_producer_pal(song):
    """Raise 409 when the Set already has Producer Pal, before anything loads.

    Top-level devices only: descending into every rack on every load costs more
    than the rare nested device is worth.
    """
    tracks = [("track %s" % i, track) for i, track in enumerate(song.tracks)]
    tracks += [
        ("return track %s" % i, track)
        for i, track in enumerate(song.return_tracks)
    ]
    tracks.append(("master track", song.master_track))

    for label, track in tracks:
        if any(_is_producer_pal(device.name) for device in track.devices):
            raise RouteError(
                409,
                "Producer Pal is already in this Live Set, on %s %r - a Set can "
                "only have one" % (label, track.name),
            )


def _item_kind(item_type, path):
    """'instrument', 'audio-effect', 'midi-effect', or None when unknown.

    The browser doesn't say what a plugin is, so plugins are always unknown.
    """
    if item_type in KIND_TYPES:
        return item_type
    if item_type == "mfl-device":
        return MFL_FOLDER_KINDS.get(path.split("/", 1)[0])
    return None


def _type_root(bridge, item_type):
    try:
        return browser.type_root(bridge.app, item_type)
    except ValueError as err:
        raise RouteError(400, str(err))


def _resolve(root, path):
    try:
        return browser.resolve_path(root, path)
    except browser.PathNotFound as err:
        raise RouteError(404, str(err), choices=err.choices[:MAX_CHOICES])


def _find_loadable(root, devices_only, params):
    name = params.get("name")
    path = params.get("path")
    if name and path:
        raise RouteError(400, "pass name or path, not both")

    if path:
        item, resolved = _resolve(root, path)
        if not item.is_loadable:
            raise RouteError(400, "%r is a folder, not something loadable" % resolved)
        return item, resolved

    if not name:
        raise RouteError(400, "pass a name or a path")
    matches = browser.match_items(root, name, devices_only)
    if not matches:
        raise RouteError(404, "nothing named %r" % name)
    if len(matches) > 1:
        raise RouteError(
            409,
            "%r matches %s items - pass one as path" % (name, len(matches)),
            candidates=[path for _, path in matches[:MAX_CANDIDATES]],
        )
    return matches[0]


def _target_track(song, params, default_track_type):
    index = _parse_track_index(params.get("track_index"))
    if index is not None:
        tracks = song.tracks
        if index >= len(tracks):
            raise RouteError(
                400, "track_index %s is out of range (%s tracks)" % (index, len(tracks))
            )
        return tracks[index]

    track_type = str(params.get("track_type") or default_track_type).strip().lower()
    if track_type == "midi":
        return song.create_midi_track(-1) or song.tracks[-1]
    if track_type == "audio":
        return song.create_audio_track(-1) or song.tracks[-1]
    raise RouteError(400, "track_type must be 'midi' or 'audio', got %r" % track_type)


def _parse_track_index(value):
    """A 0-based track index, or None when absent."""
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        raise RouteError(400, "track_index must be a whole number, got %r" % value)
    try:
        index = int(str(value).strip())
    except ValueError:
        raise RouteError(400, "track_index must be a whole number, got %r" % value)
    if index < 0:
        raise RouteError(400, "track_index must be 0 or more, got %s" % index)
    return index


def _as_bool(value):
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ("1", "true", "yes", "on")



ROUTES = {
    "/ping": ping,
    "/list": list_items,
    "/load": load,
}
