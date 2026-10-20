# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""Refusing a preset that holds the Producer Pal device, after Live loads it.

A rack preset (.adg) or one saved from a Set can hold Producer Pal inside, and
a second copy fights the first for its ports. The browser item's name can't say
so, so look at what Live loaded, take it back out, and answer 409. Main thread
only.
"""

from . import hotswap
from .errors import RouteError
from .producer_pal_device import holds_producer_pal

_CONTAINS = (
    "the preset contains the Producer Pal device, which a Set can only have once"
)


def refuse_loaded_producer_pal(song, track, before, created):
    """Raise 409 and delete what /load added when it holds Producer Pal.

    `before` is the track's devices before the load. Only the added devices that
    hold it are deleted. When the request made the track, the whole track goes.
    """
    added = [device for device in track.devices if device not in before]
    holding = [device for device in added if holds_producer_pal(device)]
    if not holding:
        return

    try:
        if created:
            song.delete_track(list(song.tracks).index(track))
        else:
            for device in reversed(holding):
                track.delete_device(list(track.devices).index(device))
    except Exception as err:
        raise RouteError(
            409,
            "%s, and the new device couldn't be removed (%s); remove it by hand"
            % (_CONTAINS, err),
        )
    raise RouteError(409, "%s; nothing was loaded" % _CONTAINS)


def refuse_hotswapped_producer_pal(song, device_path):
    """Raise 409 when the device at `device_path` now holds Producer Pal.

    The caller gives the swap an undo step of its own, so one undo puts the old
    device back. If it doesn't, the device is deleted and the slot left empty,
    and `changed` tells the caller the old device is gone.
    """
    holder, index, device = hotswap.locate_device(song, device_path)
    if not holds_producer_pal(device):
        return

    if _undo_swap(song, device_path):
        raise RouteError(409, "%s, so the swap was undone" % _CONTAINS)

    holder, index, device = hotswap.locate_device(song, device_path)
    try:
        holder.delete_device(index)
    except Exception as err:
        raise RouteError(
            409,
            "%s. Live had already loaded it, and removing it failed (%s); "
            "delete the device at %s" % (_CONTAINS, err, device_path),
            changed=True,
        )
    raise RouteError(
        409,
        "%s. Live had already loaded it onto the device, so the device was "
        "deleted and its slot is now empty" % _CONTAINS,
        changed=True,
    )


def _undo_swap(song, device_path):
    """Undo the swap; True when the device there no longer holds Producer Pal.

    Undo leaves a redo that would bring the preset back, until the next edit.
    """
    try:
        song.undo()
        return not holds_producer_pal(hotswap.device_at(song, device_path))
    except Exception:
        return False
