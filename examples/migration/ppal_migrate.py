#!/usr/bin/env python3

"""Producer Pal migration adapter (Python 3.8+, no dependencies).

Rewrites pre-2.4 tool arguments onto the `path` grammar that replaced them.
The old params still work in 2.3 -- they warn -- and are removed in 2.4. Run
your existing args through migrate_args() and send back what it returns.

A port of ppal-migrate.mjs, kept deliberately parallel: same function names in
snake_case, same cases in CASES. If you change one, change the other.

CLI:
  python ppal_migrate.py <tool-name> '<json-args>'
  python ppal_migrate.py --self-test

Library:
  from ppal_migrate import migrate_args, build_path, parse_path
  args, notes = migrate_args("ppal-read-track", {"trackIndex": 2})
  # args -> {"path": "t2"}

Some retirements are deliberately NOT rewritten, because a correct answer
needs a Live read or a judgement call. Each is reported in `notes` instead, and
the params it names are left as they were, so a call is never left
half-migrated:

  ppal-update-clip `split`
    Its positions are offsets from each clip's own start; `arrangementSplit`
    reads the song timeline. The same value cuts somewhere else -- converting
    needs each clip's arrangement start, which means reading the clip first.

  `params[].name` prefixes on ppal-create-device / ppal-update-device
    {"name": "pC1/c0/d0/Volume"} becomes path "t5/d0/pC1/c0/d0" with name
    "Volume". `params` applies to every path in a call, so values that differ
    per target turn one call into one call per target.

  ppal-library `action: "searchBatch"`
    Becomes `action: "search"` with a `searches` list: a different request
    shape, not a path translation.

  A destination two params name and one path cannot
    ppal-select's trackIndex + sceneIndex on a return or the main track (no
    clip slot to hold both), ppal-duplicate's takeLane when the source track
    cannot be read off `path`, and any value the tool itself refuses.
"""

import json
import re
import sys

SEGMENT = re.compile(r"^(mt|rt|t|s|l)(\d+|\+)?$")

# A takeLane value that names no lane the tool accepts.
_UNUSABLE_LANE = object()
COORD = re.compile(r"\[([^\]]*)\]$")


# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------


def build_path(parts=None):
    """Build a path from its parts.

    Every field is optional; whichever are present are assembled in grammar
    order -- track, then scene or take lane, then the device tail, then a
    bracketed song position. `trackIndex`, `sceneIndex` and `takeLane` take an
    int or the string "new" for the `+` spelling that names a place which does
    not exist yet.
    """
    parts = parts or {}
    segments = []
    track = _track_segment(parts.get("trackIndex"), parts.get("trackType"))

    if track:
        segments.append(track)
    if parts.get("sceneIndex") is not None:
        segments.append("s" + _index_spelling(parts["sceneIndex"]))
    if parts.get("takeLane") is not None:
        segments.append("l" + _index_spelling(parts["takeLane"]))
    segments.extend(parts.get("deviceTail") or [])

    body = "/".join(segments)
    position = parts.get("position")

    return body if position is None else "%s[%s]" % (body, position)


def parse_path(path):
    """Split a path back into the parts build_path() assembles.

    Unrecognized segments (devices, chains, drum pads) are kept in order as
    `deviceTail`, so a caller can edit one piece without string surgery.
    """
    text = str(path).strip()
    coord = COORD.search(text)
    parts = {}

    if coord:
        parts["position"] = coord.group(1)
        text = text[: coord.start()]

    device_tail = []

    for segment in [s for s in text.split("/") if s]:
        match = SEGMENT.match(segment)

        if not match:
            device_tail.append(segment)
            continue

        kind, value = match.group(1), match.group(2)

        if kind == "mt":
            parts["trackType"] = "main"
        elif kind == "rt":
            parts.update(trackType="return", trackIndex=_index_value(value))
        elif kind == "t":
            parts.update(trackType="regular", trackIndex=_index_value(value))
        elif kind == "s":
            parts["sceneIndex"] = _index_value(value)
        else:
            parts["takeLane"] = _index_value(value)

    if device_tail:
        parts["deviceTail"] = device_tail

    return parts


def _track_segment(track_index, track_type):
    """The track segment: "mt", "rt0", "t0", or "" when no track is named."""
    if track_type in ("main", "master"):
        return "mt"
    if track_index is None:
        return ""

    # create-track spelled "append" as trackIndex -1; the path spelling is "t+".
    index = "new" if track_index == -1 else track_index
    prefix = "rt" if track_type == "return" else "t"

    return prefix + _index_spelling(index)


def _index_spelling(index):
    """"new" is `+`; anything else is a plain 0-based number."""
    if index == "new":
        return "+"

    return str(index)


def _index_value(value):
    """The inverse: `+` reads back as "new"."""
    if value == "+":
        return "new"

    return int(value)


# ---------------------------------------------------------------------------
# Argument migration
# ---------------------------------------------------------------------------


def migrate_args(tool_name, args=None):
    """Rewrite one tool call's arguments.

    Returns (args, notes). `notes` holds anything the adapter could not
    translate on its own, in the words you'd want in a code review. Empty notes
    means the call migrated cleanly.
    """
    out = dict(args or {})
    notes = []
    migration = _MIGRATIONS.get(tool_name)

    if migration:
        migration(out, notes)

    _add_params_prefix_notes(out, notes)

    return out, notes


def _migrate_track_target(args, notes=None):
    """trackIndex + trackType -> a track path. -1 meant append, so "t+"."""
    # trackType alone names a track only for the main track, which has no index.
    # "return" or "regular" without one named nothing then either, so leave the
    # call as it stands rather than inventing index 0.
    if args.get("trackIndex") is None and not _names_main_track(
        args.get("trackType")
    ):
        return

    _set(args, "path", build_path(_take_track(args)))


def _migrate_create_track(args, notes=None):
    """create-track spells a return track as `type`, not trackType.

    The path settles both the type and the position -- Live appends return
    tracks, so trackIndex never applied to one.
    """
    # A caller already using `path` is naming the destination twice; the tool
    # has its own answer for that, and dropping either side would hide it.
    if args.get("type") == "return" and args.get("path") is None:
        args.pop("type", None)
        args.pop("trackIndex", None)
        args["path"] = "rt+"

        return

    _migrate_track_target(args)


def _migrate_scene_target(args, notes=None):
    if args.get("sceneIndex") is None:
        return

    _set(args, "path", build_path({"sceneIndex": _take(args, "sceneIndex")}))


def _migrate_routing_ids(args, notes=None):
    """The four routing params that grew an `Id` suffix.

    The value is untouched: the surviving param already accepts a name or an id.
    """
    for name in (
        "inputRoutingType",
        "inputRoutingChannel",
        "outputRoutingType",
        "outputRoutingChannel",
    ):
        if args.get(name + "Id") is not None:
            _set(args, name, _take(args, name + "Id"))


def _migrate_slot(args, source, target):
    """"0/3" -> "t0/s3", comma-separated lists included."""
    paths = _slot_paths(args, source)

    if paths:
        _set(args, target, ",".join(paths))


def _slot_paths(args, key):
    """The slot list as one path each, and the param gone."""
    if args.get(key) is None:
        return []

    paths = []

    for slot in _split_list(_take(args, key)):
        track_index, scene_index = slot.split("/")
        paths.append(
            build_path(
                {
                    "trackIndex": int(track_index),
                    "sceneIndex": int(scene_index),
                }
            )
        )

    return paths


def _migrate_create_clip(args, notes):
    # A slot list and a trackIndex compose: the first names session
    # destinations, the second an arrangement one, and a call sending both makes
    # both clips. So they join into one path list rather than one overwriting
    # the other.
    paths = _slot_paths(args, "slot")

    if args.get("trackIndex") is not None and args.get("sceneIndex") is not None:
        parts = _take_track(args)
        parts.update(_take_scene(args))
        paths.append(build_path(parts))
    elif args.get("arrangementStart") is not None:
        # One destination track broadcasts across every position, which is how
        # the old params paired: trackIndex was a single value and
        # arrangementStart a list.
        track = _take_track(args)
        lane = _take_lane_target(args, notes)

        paths.extend(_position_paths(args, "arrangementStart", track, lane))
    elif args.get("trackIndex") is not None:
        paths.append(build_path(_take_track(args)))

    if paths:
        _set(args, "path", ",".join(paths))

    if args.get("arrangementStart") is not None:
        notes.append(
            "arrangementStart left as-is: trackIndex and sceneIndex named a "
            "clip slot, so no track is left for a position. Name the "
            'arrangement track yourself, as "t<track>[<position>]".'
        )


def _migrate_update_clip(args, notes):
    _migrate_slot(args, "toSlot", "toPath")

    # No destination-track param existed here: the clip stayed on its own track,
    # which a path spells as a bare coordinate.
    if args.get("arrangementStart") is not None:
        _set(
            args,
            "toPath",
            ",".join(_position_paths(args, "arrangementStart", {}, None)),
        )

    if args.get("split") is not None:
        notes.append(
            "split %s left as-is: its positions are offsets from each clip's "
            "start, and arrangementSplit reads the song timeline. Read each "
            "clip's start position and add it before you rename the param."
            % json.dumps(args["split"])
        )


def _migrate_library(args, notes):
    if args.get("action") != "searchBatch":
        return

    notes.append(
        'action "searchBatch" left as-is: it becomes action "search" with '
        "a `searches` list, which is a different request shape."
    )


def _migrate_duplicate(args, notes):
    _migrate_slot(args, "toSlot", "toPath")

    if args.get("locator") is not None:
        args["arrangementStart"] = ",".join(
            "loc:" + name for name in _split_list(_take(args, "locator"))
        )

    if args.get("arrangementStart") is None:
        return

    # `arrangementStart` alone kept the copy on its source's track, which a path
    # spells as a bare "[5|1]". A take lane can't be spelled that way -- Live
    # refuses "l0[5|1]" -- so with a lane the destination has to name the track,
    # and the only place to read it from is the source path.
    lane = _lane_index(args.get("takeLane"))
    track = {} if lane is None else _source_track(args)

    if lane is _UNUSABLE_LANE:
        notes.append(_unusable_lane_note(args.get("takeLane")))

        return

    if track is None:
        notes.append(
            "takeLane and arrangementStart left as-is: a take lane in a path "
            'needs its track ("t1/l0[5|1]"), and the source track could not '
            "be read from `path` (absent, or several tracks). Name the "
            "destination track yourself."
        )

        return

    args.pop("takeLane", None)
    _set(
        args,
        "toPath",
        ",".join(_position_paths(args, "arrangementStart", track, lane)),
    )


def _migrate_select(args, notes):
    _migrate_slot(args, "slot", "path")

    # trackIndex and sceneIndex select both at once, which one path spells as a
    # clip slot -- but only for a regular track. A return or the main track has
    # no clip slots, so that pair names two things no single path can.
    if args.get("trackIndex") is not None and args.get("sceneIndex") is not None:
        if _names_regular_track(args.get("trackType")):
            parts = _take_track(args)
            parts.update(_take_scene(args))
            _set(args, "path", build_path(parts))
        else:
            notes.append(
                "trackType %s and sceneIndex left as-is: they select two "
                "things, and a return or the main track has no clip slot to "
                "name both in one path. Select them in two calls."
                % json.dumps(args.get("trackType"))
            )
    else:
        _migrate_track_target(args)
        _migrate_scene_target(args)

    if args.get("devicePath") is not None:
        _set(args, "path", _take(args, "devicePath"))


def _migrate_playback(args, notes=None):
    _migrate_slot(args, "slots", "path")
    _migrate_scene_target(args)

    for source, target in (
        ("startLocator", "startTime"),
        ("loopStartLocator", "loopStart"),
        ("loopEndLocator", "loopEnd"),
    ):
        if args.get(source) is not None:
            _set(args, target, "loc:" + str(_take(args, source)))


_MIGRATIONS = {
    "ppal-read-track": _migrate_track_target,
    "ppal-create-track": _migrate_create_track,
    "ppal-update-track": _migrate_routing_ids,
    "ppal-read-scene": _migrate_scene_target,
    "ppal-create-scene": _migrate_scene_target,
    "ppal-read-clip": lambda args, notes: _migrate_slot(args, "slot", "path"),
    "ppal-create-clip": _migrate_create_clip,
    "ppal-update-clip": _migrate_update_clip,
    "ppal-duplicate": _migrate_duplicate,
    "ppal-select": _migrate_select,
    "ppal-playback": _migrate_playback,
    "ppal-library": _migrate_library,
}


# ---------------------------------------------------------------------------
# Shared pieces
# ---------------------------------------------------------------------------


def _position_paths(args, key, track, take_lane):
    """Fuse a list of song positions onto a destination, one path per position."""
    paths = []

    # Every `l+` in one call lands on the same new lane, which is what one
    # `takeLane: "new"` did.
    for position in _split_list(_take(args, key)):
        parts = dict(track)
        parts.update(takeLane=take_lane, position=position)
        paths.append(build_path(parts))

    return paths


def _source_track(args):
    """The one track every source path names, as build_path parts.

    None when the sources are addressed by id or span more than one track.
    """
    entries = [] if args.get("path") is None else _split_list(args["path"])
    tracks = set()

    for entry in entries:
        parts = parse_path(entry)
        tracks.add(
            build_path(
                {
                    "trackIndex": parts.get("trackIndex"),
                    "trackType": parts.get("trackType"),
                }
            )
        )

    if len(tracks) != 1:
        return None

    only = tracks.pop()

    return None if only == "" else parse_path(only)


def _take_track(args):
    track_index = _take(args, "trackIndex")
    track_type = _take(args, "trackType")

    if track_index is None and track_type is None:
        return {}

    # trackType "master" named the main track on its own, with no index.
    if track_type == "master":
        return {"trackType": "main"}

    return {
        "trackType": track_type or "regular",
        "trackIndex": 0 if track_index is None else track_index,
    }


def _names_main_track(track_type):
    """Whether trackType named the main track, the one track with no index."""
    return track_type in ("master", "main")


def _names_regular_track(track_type):
    """Whether trackType named a regular track -- the only kind with clip slots."""
    return track_type is None or track_type == "regular"


def _take_scene(args):
    scene_index = _take(args, "sceneIndex")

    return {} if scene_index is None else {"sceneIndex": scene_index}


def _take_lane_target(args, notes):
    """The take lane the call named, as a path target, with the param removed.

    A value that names no lane the tool accepts keeps its param and gets a note
    instead: the call fails either way, and quietly rewriting it as the main
    lane would hide that.
    """
    lane = _lane_index(args.get("takeLane"))

    if lane is _UNUSABLE_LANE:
        notes.append(_unusable_lane_note(args.get("takeLane")))

        return None

    args.pop("takeLane", None)

    return lane


def _unusable_lane_note(value):
    """What to say about a takeLane value the tool would refuse."""
    return (
        "takeLane %s left as-is: it names no lane. The param counts from 1 -- "
        '0 is the main lane, 1 is "l0", and "new" is "l+".' % json.dumps(value)
    )


def _lane_index(value):
    """Convert a 1-based takeLane to the 0-based `l<n>` path segment.

    takeLane counted from 1 and the path segment counts from 0, so this is off
    by one everywhere -- and takeLane 0 named the main lane, which is no take
    lane at all rather than lane 0. Returns None where no lane was named, and
    _UNUSABLE_LANE for a value the tool refuses.
    """
    if value is None or value == "":
        return None
    if str(value) == "new":
        return "new"

    try:
        lane = int(value)
    except (TypeError, ValueError):
        return _UNUSABLE_LANE

    if lane < 0:
        return _UNUSABLE_LANE

    return None if lane == 0 else lane - 1


def _add_params_prefix_notes(args, notes):
    """Flag a param name that may carry a device path prefix.

    Not tied to a tool: only the device tools take `params`, and both of them
    changed the same way.
    """
    for param in args.get("params") or []:
        name = param.get("name") if isinstance(param, dict) else None

        if isinstance(name, str) and "/" in name:
            notes.append(
                "params name %s may carry a device path prefix, which moves "
                "into `path`. Params apply to every path in a call, so "
                "per-target values need one call each. (A real param name "
                'containing a slash, like "Dry/Wet", needs no change.)'
                % json.dumps(name)
            )


def _split_list(value):
    if isinstance(value, list):
        return [str(entry) for entry in value]

    return [entry.strip() for entry in str(value).split(",") if entry.strip()]


def _take(args, key):
    """Read a param and remove it, so the old spelling never ships."""
    return args.pop(key, None)


def _set(args, key, value):
    """Write the replacement, leaving an explicit value the caller already set."""
    if args.get(key) is None:
        args[key] = value


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

# `before` and `after` name the same thing, and every row migrates cleanly --
# the self-test fails a row that comes back with a note.
# The tool names below, written once each.
TOOL = {
    "createClip": "ppal-create-clip",
    "createTrack": "ppal-create-track",
    "duplicate": "ppal-duplicate",
    "library": "ppal-library",
    "playback": "ppal-playback",
    "readClip": "ppal-read-clip",
    "readScene": "ppal-read-scene",
    "readTrack": "ppal-read-track",
    "select": "ppal-select",
    "updateClip": "ppal-update-clip",
    "updateDevice": "ppal-update-device",
    "updateTrack": "ppal-update-track",
}

CASES = [
    (TOOL["readTrack"], {"trackIndex": 2}, {"path": "t2"}),
    (
        TOOL["readTrack"],
        {"trackIndex": 0, "trackType": "return"},
        {"path": "rt0"},
    ),
    # A type with no index named nothing then either, so it is left to fail the
    # way it already did rather than being pointed at return track 0.
    (TOOL["readTrack"], {"trackType": "return"}, {"trackType": "return"}),
    (TOOL["select"], {"trackType": "master"}, {"path": "mt"}),
    # Both are selected, and one clip-slot path says so.
    (TOOL["select"], {"trackIndex": 1, "sceneIndex": 3}, {"path": "t1/s3"}),
    (TOOL["createTrack"], {"trackIndex": -1}, {"path": "t+"}),
    # Live appends return tracks, so the path carries the type and the position.
    (
        TOOL["createTrack"],
        {"trackIndex": -1, "type": "return"},
        {"path": "rt+"},
    ),
    (
        TOOL["updateTrack"],
        {"outputRoutingTypeId": "2"},
        {"outputRoutingType": "2"},
    ),
    (TOOL["readScene"], {"sceneIndex": 2}, {"path": "s2"}),
    (TOOL["readClip"], {"slot": "1/0"}, {"path": "t1/s0"}),
    (TOOL["select"], {"devicePath": "t6/d0"}, {"path": "t6/d0"}),
    (
        TOOL["playback"],
        {"action": "play-session-clips", "slots": "0/0,1/0"},
        {"action": "play-session-clips", "path": "t0/s0,t1/s0"},
    ),
    (
        TOOL["playback"],
        {"action": "play-arrangement", "startLocator": "Chorus"},
        {"action": "play-arrangement", "startTime": "loc:Chorus"},
    ),
    (
        TOOL["createClip"],
        {"trackIndex": 1, "arrangementStart": "33|1,37|1"},
        {"path": "t1[33|1],t1[37|1]"},
    ),
    # A slot list and a trackIndex named a session and an arrangement
    # destination in one call, and both clips still get made.
    (
        TOOL["createClip"],
        {"slot": "0/0", "trackIndex": 1, "arrangementStart": "5|1"},
        {"path": "t0/s0,t1[5|1]"},
    ),
    # takeLane 0 was the main lane, which is no take lane at all.
    (
        TOOL["createClip"],
        {"trackIndex": 1, "arrangementStart": "5|1", "takeLane": 0},
        {"path": "t1[5|1]"},
    ),
    (
        TOOL["createClip"],
        {"trackIndex": 1, "arrangementStart": "21|1", "takeLane": "new"},
        {"path": "t1/l+[21|1]"},
    ),
    # One takeLane made one lane however many positions landed on it, and every
    # `l+` in one call lands on that same lane.
    (
        TOOL["createClip"],
        {"trackIndex": 1, "arrangementStart": "21|1,25|1", "takeLane": "new"},
        {"path": "t1/l+[21|1],t1/l+[25|1]"},
    ),
    (
        TOOL["duplicate"],
        {
            "type": "clip",
            "path": "t1/s0",
            "takeLane": "1",
            "arrangementStart": "17|1",
        },
        {"type": "clip", "path": "t1/s0", "toPath": "t1/l0[17|1]"},
    ),
    (
        TOOL["duplicate"],
        {
            "type": "clip",
            "path": "t1/s0",
            "takeLane": "new",
            "arrangementStart": "17|1,21|1",
        },
        {
            "type": "clip",
            "path": "t1/s0",
            "toPath": "t1/l+[17|1],t1/l+[21|1]",
        },
    ),
    (
        TOOL["duplicate"],
        {"type": "clip", "path": "t1/s0", "locator": "Chorus"},
        {"type": "clip", "path": "t1/s0", "toPath": "[loc:Chorus]"},
    ),
    (
        TOOL["updateClip"],
        {"path": "t1[41|1],t1[45|1]", "arrangementStart": "49|1,53|1"},
        {"path": "t1[41|1],t1[45|1]", "toPath": "[49|1],[53|1]"},
    ),
    (
        TOOL["updateClip"],
        {"path": "t1/s0", "toSlot": "2/5"},
        {"path": "t1/s0", "toPath": "t2/s5"},
    ),
]

# The other half of the contract: what the adapter refuses to translate. Each
# row is the call, a word its note has to carry, and the params it must leave
# alone for the caller to deal with.
NOTE_CASES = [
    (TOOL["updateClip"], {"path": "t1[9|1]", "split": "2|1"}, "split", ["split"]),
    (TOOL["library"], {"action": "searchBatch"}, "searchBatch", ["action"]),
    (
        TOOL["createClip"],
        {"trackIndex": 1, "arrangementStart": "5|1", "takeLane": "later"},
        "takeLane",
        ["takeLane"],
    ),
    (
        TOOL["createClip"],
        {"trackIndex": 1, "sceneIndex": 2, "arrangementStart": "5|1"},
        "arrangementStart",
        ["arrangementStart"],
    ),
    (
        TOOL["select"],
        {"trackType": "return", "trackIndex": 0, "sceneIndex": 2},
        "sceneIndex",
        ["trackType", "trackIndex", "sceneIndex"],
    ),
    (
        TOOL["duplicate"],
        {
            "type": "clip",
            "id": "id 1",
            "takeLane": "1",
            "arrangementStart": "17|1",
        },
        "take lane",
        ["takeLane", "arrangementStart"],
    ),
    (
        TOOL["updateDevice"],
        {"path": "t5/d0", "params": [{"name": "pC1/c0/d0/Volume", "value": "-6"}]},
        "device path",
        ["params"],
    ),
]


def self_test():
    failed = 0

    for tool, before, expected in CASES:
        args, notes = migrate_args(tool, before)

        # A row here migrated cleanly, so a note on one means the adapter is no
        # longer sure of an answer it is still handing back.
        if notes:
            failed += 1
            print("FAIL %s %s" % (tool, json.dumps(before)), file=sys.stderr)
            print("  unexpected note: %s" % notes[0], file=sys.stderr)

        if args != expected:
            failed += 1
            print("FAIL %s %s" % (tool, json.dumps(before)), file=sys.stderr)
            print("  want %s" % json.dumps(expected), file=sys.stderr)
            print("  got  %s" % json.dumps(args), file=sys.stderr)

    for tool, before, word, kept in NOTE_CASES:
        asked = json.dumps(before)
        args, notes = migrate_args(tool, before)

        if not any(word in note for note in notes):
            failed += 1
            print("FAIL %s %s" % (tool, asked), file=sys.stderr)
            print(
                '  want a note about "%s", got %d' % (word, len(notes)),
                file=sys.stderr,
            )

        # A note says the caller still has this one to handle, so the param it
        # names has to survive: rewriting half of it is worse than none.
        for param in [name for name in kept if args.get(name) is None]:
            failed += 1
            print("FAIL %s %s" % (tool, asked), file=sys.stderr)
            print(
                '  noted but dropped "%s": %s' % (param, json.dumps(args)),
                file=sys.stderr,
            )

    # A path survives a round trip through its parts, which is the property the
    # adapter leans on everywhere it edits one piece of a path.
    for path in ("t0", "rt1", "mt", "t+", "t0/s3", "t1/l0[17|1]"):
        round_trip = build_path(parse_path(path))

        if round_trip != path:
            failed += 1
            print("FAIL round trip %s -> %s" % (path, round_trip), file=sys.stderr)

    print(
        "%d cases + round trips OK" % (len(CASES) + len(NOTE_CASES))
        if failed == 0
        else "%d failure(s)" % failed
    )

    return 0 if failed == 0 else 1


def main(argv):
    if argv[:1] == ["--self-test"]:
        return self_test()

    if not argv:
        print("usage: ppal_migrate.py <tool-name> '<json-args>'", file=sys.stderr)
        print("       ppal_migrate.py --self-test", file=sys.stderr)

        return 1

    tool_name = argv[0]
    raw = argv[1] if len(argv) > 1 else "{}"

    try:
        parsed = json.loads(raw)
    except ValueError as error:
        print("could not read the args as JSON: %s" % error, file=sys.stderr)
        print(
            "quote them as one argument, e.g. '{\"trackIndex\": 2}'",
            file=sys.stderr,
        )

        return 1

    args, notes = migrate_args(tool_name, parsed)

    print(json.dumps(args, indent=2))

    for note in notes:
        print("note: " + note, file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
