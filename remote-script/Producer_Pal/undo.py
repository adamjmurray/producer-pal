# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""Live's undo history. `/undo/end` closes the pending undo step: Live merges
everything changed since the last step into one, so Producer Pal calls it after
each write tool call to make that call one step. `/undo/undo` and `/undo/redo`
step through that history, which also holds the user's own edits. Main thread
only.

A step can remove Producer Pal itself (undoing the step that inserted it). That
kills the server answering the request, so the step is reversed at once and
the next step in that direction is refused until Producer Pal writes again.
"""

from .errors import RouteError
from .params import parse_whole
from .producer_pal_device import count_producer_pal

# Most steps one call takes.
MAX_STEPS = 50

# Where the "next step would remove Producer Pal" flag lives: on the bridge,
# which Live replaces when it loads another Set (and which a hot reload keeps).
_BLOCKED = "_undo_blocked_direction"


def end(bridge, params):
    """Close the pending undo step. Harmless when nothing is pending."""
    bridge.song.end_undo_step()
    # Producer Pal wrote, so the history has moved past the step that was unsafe.
    setattr(bridge, _BLOCKED, None)
    return {"ok": True}


def undo(bridge, params):
    """Undo up to `steps` steps, stopping early where Live has no more."""
    return _step(bridge, params, "undo", "redo")


def redo(bridge, params):
    """Redo up to `steps` steps, stopping early where Live has no more."""
    return _step(bridge, params, "redo", "undo")


def _step(bridge, params, action, reverse):
    steps = _parse_steps(params)
    if getattr(bridge, _BLOCKED, None) == action:
        raise RouteError(409, _removes_producer_pal("next " + action, "wasn't done"))
    song = bridge.song
    if not _can(song, action):
        raise RouteError(409, "nothing to " + action, **_state(song))

    done = 0
    stopped = None
    tripped = False
    while done < steps:
        if not _can(song, action):
            stopped = "nothing more to " + action
            break
        before = count_producer_pal(song)
        getattr(song, action)()
        if count_producer_pal(song) < before:
            # Put it back before the server dies with it.
            getattr(song, reverse)()
            setattr(bridge, _BLOCKED, action)
            tripped = True
            stopped = _removes_producer_pal("next " + action, "was stopped")
            break
        done += 1

    if done and not tripped:
        # Going this way moved past the step that was unsafe the other way.
        setattr(bridge, _BLOCKED, None)
    result = dict(_state(song), done=done)
    if stopped is not None:
        result["stopped"] = stopped
    return result


def _parse_steps(params):
    value = params.get("steps")
    if value is None or value == "":
        return 1
    return parse_whole(value, "steps", 1, MAX_STEPS)


def _removes_producer_pal(what, outcome):
    return (
        "The %s would remove Producer Pal from the Set, so it %s. If the user "
        "wants that, or the next step is an edit of theirs, they can do it in "
        "Live." % (what, outcome)
    )


def _can(song, action):
    return bool(song.can_undo if action == "undo" else song.can_redo)


def _state(song):
    """What Live can undo and redo now."""
    return {"can_undo": bool(song.can_undo), "can_redo": bool(song.can_redo)}


ROUTES = {"/undo/end": end, "/undo/undo": undo, "/undo/redo": redo}
