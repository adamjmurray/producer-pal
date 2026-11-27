# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""Two conversions only `Live.Conversions` can do: a track's devices onto a pad
of a new Drum Rack, and a drum pad's chain onto a new MIDI track. Live does both
before the call returns. See dev/live-api/conversions.md.

Live puts the new track right after the selected one, so each route selects a
track first: the source for a track's devices, the last track for a pad. Live
then selects and arms the new track.

Main thread only."""

import Live

from . import hotswap
from .clip_address import regular_track
from .errors import RouteError
from .params import parse_whole
from .producer_pal_device import holds_producer_pal


def track_to_drum_rack(bridge, params):
    """Put a track's devices on pad C1 of a new Drum Rack, on a new track.

    Live keeps a source track that has clips, and deletes one that has none.
    Answers `{track_index, source_removed}`: where the new track is now.
    """
    song = bridge.song
    track = regular_track(song, params.get("track"))
    if track.is_foldable:
        raise RouteError(409, "a group track has no devices to convert")
    if len(track.devices) == 0:
        raise RouteError(409, "the track has no devices")
    # Its devices would move to the new track, or Live would delete this one.
    if any(holds_producer_pal(device) for device in track.devices):
        raise RouteError(409, "the track holds the Producer Pal device")
    # Live crashes when it deletes a group's only track here.
    if not _has_clips(track) and _is_only_child(song, track):
        raise RouteError(
            409,
            "Live can't convert a track with no clips that is the only track in its group",
        )

    convert = _conversion("move_devices_on_track_to_new_drum_rack_pad")
    index = list(song.tracks).index(track)
    before = _keys(song)
    _select(song, track)
    try:
        convert(song, index)
    except RuntimeError as err:
        raise RouteError(409, "Live refused the conversion: %s" % err)

    return {
        "track_index": _new_track_index(song, before),
        "source_removed": _key(track) not in _keys(song),
    }


def drum_pad_to_track(bridge, params):
    """Copy a drum pad's chain onto a new MIDI track, after the last track.

    The pad keeps its chain. `device_path` names the Drum Rack and `note` the
    pad. Answers `{track_index}`: where the new track is.
    """
    song = bridge.song
    note = parse_whole(params.get("note"), "note", 0, 127)
    try:
        rack = hotswap.device_at(song, params.get("device_path"))
    except hotswap.DevicePathError as err:
        raise RouteError(404, str(err))
    pads = getattr(rack, "drum_pads", None) if rack.can_have_drum_pads else None
    if pads is None:
        raise RouteError(409, "the device isn't a Drum Rack")
    # A Drum Rack nested in another has no pads of its own.
    if note >= len(pads):
        raise RouteError(409, "this Drum Rack has no pads of its own (it is inside another rack)")
    pad = pads[note]
    if len(pad.chains) == 0:
        raise RouteError(409, "the pad is empty")
    # A second Producer Pal would fight the first for its ports.
    if any(holds_producer_pal(device) for chain in pad.chains for device in chain.devices):
        raise RouteError(409, "the pad holds the Producer Pal device")

    convert = _conversion("create_midi_track_from_drum_pad")
    before = _keys(song)
    _select(song, song.tracks[-1])
    try:
        convert(song, pad)
    except RuntimeError as err:
        raise RouteError(409, "Live refused the conversion: %s" % err)

    return {"track_index": _new_track_index(song, before)}


def _conversion(name):
    convert = getattr(getattr(Live, "Conversions", None), name, None)
    if convert is None:
        raise RouteError(409, "this Live version doesn't have this conversion")
    return convert


def _has_clips(track):
    if any(slot.has_clip for slot in track.clip_slots):
        return True
    return len(track.arrangement_clips) > 0


def _is_only_child(song, track):
    if not track.is_grouped:
        return False
    group = track.group_track
    siblings = [t for t in song.tracks if t.is_grouped and t.group_track == group]
    return len(siblings) <= 1


def _key(track):
    # Live hands out a new Python object per read; the pointer is stable.
    return getattr(track, "_live_ptr", id(track))


def _keys(song):
    return set(_key(track) for track in song.tracks)


def _select(song, track):
    try:
        song.view.selected_track = track
    except Exception:
        # Only decides where the new track lands.
        pass


def _new_track_index(song, before):
    for index, track in enumerate(song.tracks):
        if _key(track) not in before:
            return index
    raise RouteError(500, "Live made no new track")


ROUTES = {
    "/track/to-drum-rack": track_to_drum_rack,
    "/device/drum-pad/to-track": drum_pad_to_track,
}
