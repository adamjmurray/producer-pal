# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""Finding the clip a route names: `track` ("t0", or "rt0" for a Live 13 return
track), then `slot` (Session) or `arrangement_index`. The main track has no
clips, so it's refused."""

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


def clip_track(song, path):
    """A track that can hold clips: `t0`, or a return track `rt0` (Live 13)."""
    m = re.fullmatch(r"(rt|t)(\d+)", str(path or ""))
    if not m:
        raise RouteError(400, "track must be t0, t1... or rt0, rt1... (the main track has no clips)")
    if m[1] == "t":
        return regular_track(song, path)
    i = int(m[2])
    if i >= len(song.return_tracks):
        raise RouteError(404, "no track %s" % path)
    return song.return_tracks[i]


def clip_in_track(track, params):
    """The Session clip in `slot`, or the Arrangement clip at `arrangement_index`.

    A return track (`params["track"]` is "rt0"...) has Session slots only, and
    only in Live 13."""
    on_return = str(params.get("track") or "").startswith("rt")
    if "slot" in params:
        i = whole_number(params["slot"], "slot")
        slots = _return_slots(track) if on_return else track.clip_slots
        if i >= len(slots):
            raise RouteError(404, "no slot %s" % i)
        slot = slots[i]
        if not slot.has_clip:
            raise RouteError(404, "slot %s is empty" % i)
        return slot.clip
    if "arrangement_index" in params:
        i = whole_number(params["arrangement_index"], "arrangement_index")
        # Live raises on a return track's arrangement_clips, so it isn't read.
        if on_return:
            raise RouteError(400, "return tracks have no arrangement clips")
        if i >= len(track.arrangement_clips):
            raise RouteError(404, "no arrangement clip %s" % i)
        return track.arrangement_clips[i]
    raise RouteError(400, "give slot or arrangement_index")


def _return_slots(track):
    """A return track's clip slots. Live 12 has none (it has no attribute, an
    empty list, or refuses the read), which is a 400 rather than a missing slot."""
    try:
        slots = track.clip_slots
    except Exception:
        slots = None
    if not slots:
        raise RouteError(400, "this track has no clip slots (return tracks have them from Live 13)")
    return slots


def whole_number(value, name, minimum=0):
    """A required whole number of at least `minimum`."""
    i = parse_index(value, name)
    if i is None:
        raise RouteError(400, "%s must be a whole number" % name)
    if i < minimum:
        raise RouteError(400, "%s must be %d or more, got %s" % (name, minimum, i))
    return i
