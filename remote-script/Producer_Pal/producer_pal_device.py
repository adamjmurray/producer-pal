# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""Recognizing the Producer Pal device. A Live Set can only have one."""

PRODUCER_PAL_NAME = "producer_pal"


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
