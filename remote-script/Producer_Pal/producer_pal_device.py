# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""Recognizing the Producer Pal device. A Live Set can only have one."""

from collections import namedtuple

PRODUCER_PAL_NAME = "producer_pal"

# A Producer Pal device found on a track. `track_path` is how the tools name
# the track ("t2", "rt0", "mt"); `device_path` is the device's Live path.
FoundDevice = namedtuple("FoundDevice", "track_path track device_path device")


def is_producer_pal(name):
    """True for the Producer Pal device, any case, with or without .amxd."""
    text = str(name or "").strip().lower()
    if text.endswith(".amxd"):
        text = text[: -len(".amxd")]
    return text == PRODUCER_PAL_NAME


def holds_producer_pal(device):
    """True for the Producer Pal device, or a device with it somewhere inside.

    Looks in chains, return chains and drum pads. Goes by name only, so a
    renamed Producer Pal isn't found.
    """
    if is_producer_pal(device.name):
        return True
    return any(holds_producer_pal(inner) for inner in _inner_devices(device))


def top_level_producer_pals(song):
    """A FoundDevice for each Producer Pal device that sits directly on a track,
    return track or the main track.

    Racks aren't searched: descending into every rack costs more than the rare
    nested device is worth.
    """
    tracks = [
        ("t%s" % i, "tracks %s" % i, t)
        for i, t in enumerate(song.tracks)
    ]
    tracks += [
        ("rt%s" % i, "return_tracks %s" % i, t)
        for i, t in enumerate(song.return_tracks)
    ]
    tracks.append(("mt", "master_track", song.master_track))

    return [
        FoundDevice(short, track, "live_set %s devices %s" % (live_path, index), device)
        for short, live_path, track in tracks
        for index, device in enumerate(track.devices)
        if is_producer_pal(device.name)
    ]


def count_producer_pal(song):
    """How many top-level devices in the Set are, or hold, Producer Pal.

    Looks at every track, return track and the main track. A rack holding it
    counts once, so a step that moves it in or out of a rack doesn't change the
    count.
    """
    tracks = list(song.tracks) + list(song.return_tracks) + [song.master_track]
    return sum(
        1 for track in tracks for device in track.devices if holds_producer_pal(device)
    )


def _inner_devices(device):
    chains = _members(device, "chains") + _members(device, "return_chains")
    for pad in _members(device, "drum_pads"):
        chains += _members(pad, "chains")
    return [inner for chain in chains for inner in chain.devices]


def _members(obj, name):
    """`obj.name` as a list, or [] where it has none. Live raises rather than
    answering empty: drum_pads on a rack that isn't a Drum Rack is a
    RuntimeError ("Only drum racks can have pads!")."""
    try:
        return list(getattr(obj, name, None) or [])
    except RuntimeError:
        return []
