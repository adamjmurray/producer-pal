# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: GPL-3.0-or-later

"""Finding the clip a route names: `track` ("t0"), then `slot` (Session) or
`arrangement_index`. Return and master tracks have no clips, so they're refused."""

import re

from .errors import RouteError
from .params import parse_index


def regular_track(song, path):
    """A regular track. Return and master tracks have no clips."""
    m = re.fullmatch(r"t(\d+)", str(path or ""))
    if not m:
        raise RouteError(400, "track must be t0, t1... (return and master tracks have no clips)")
    i = int(m[1])
    if i >= len(song.tracks):
        raise RouteError(404, "no track %s" % path)
    return song.tracks[i]


def clip_in_track(track, params):
    """The Session clip in `slot`, or the Arrangement clip at `arrangement_index`."""
    if "slot" in params:
        i = whole_number(params["slot"], "slot")
        if i >= len(track.clip_slots):
            raise RouteError(404, "no slot %s" % i)
        slot = track.clip_slots[i]
        if not slot.has_clip:
            raise RouteError(404, "slot %s is empty" % i)
        return slot.clip
    if "arrangement_index" in params:
        i = whole_number(params["arrangement_index"], "arrangement_index")
        if i >= len(track.arrangement_clips):
            raise RouteError(404, "no arrangement clip %s" % i)
        return track.arrangement_clips[i]
    raise RouteError(400, "give slot or arrangement_index")


def whole_number(value, name, minimum=0):
    """A required whole number of at least `minimum`."""
    i = parse_index(value, name)
    if i is None:
        raise RouteError(400, "%s must be a whole number" % name)
    if i < minimum:
        raise RouteError(400, "%s must be %d or more, got %s" % (name, minimum, i))
    return i
