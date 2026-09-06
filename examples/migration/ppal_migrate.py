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

Three retirements are deliberately NOT rewritten, because a correct answer
needs a Live read or a judgement call. Each is reported in `notes` instead, so
a call is never left half-migrated:

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
"""

import json
import re
import sys

SEGMENT = re.compile(r"^(mt|rt|t|s|l)(\d+|\+)?$")
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
    """"new" is the `+` spelling; anything else is a plain 0-based number."""
    return "+" if index == "new" else str(index)


def _index_value(value):
    """The inverse: `+` reads back as "new"."""
    return "new" if value == "+" else int(value)


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
    if args.get("trackIndex") is None and args.get("trackType") is None:
        return

    _set(args, "path", build_path(_take_track(args)))


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
    if args.get(source) is None:
        return

    paths = []

    for slot in _split_list(_take(args, source)):
        track_index, scene_index = slot.split("/")
        paths.append(
            build_path(
                {
                    "trackIndex": int(track_index),
                    "sceneIndex": int(scene_index),
                }
            )
        )

    _set(args, target, ",".join(paths))


def _migrate_create_clip(args, notes=None):
    _migrate_slot(args, "slot", "path")

    if args.get("arrangementStart") is not None:
        # One destination track broadcasts across every position, which is how
        # the old params paired: trackIndex was a single value and
        # arrangementStart a list.
        track = _take_track(args)
        lane = _lane_index(_take(args, "takeLane"))

        _set(args, "path", _position_paths(args, "arrangementStart", track, lane))

        return

    if args.get("trackIndex") is not None or args.get("sceneIndex") is not None:
        parts = _take_track(args)
        parts.update(_take_scene(args))
        _set(args, "path", build_path(parts))


def _migrate_update_clip(args, notes):
    _migrate_slot(args, "toSlot", "toPath")

    # No destination-track param existed here: the clip stayed on its own track,
    # which a path spells as a bare coordinate.
    if args.get("arrangementStart") is not None:
        _set(args, "toPath", _position_paths(args, "arrangementStart", {}, None))

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
    lane = None if args.get("takeLane") is None else _lane_index(args["takeLane"])
    track = {} if lane is None else _source_track(args)

    if track is None:
        notes.append(
            "takeLane and arrangementStart left as-is: a take lane in a path "
            'needs its track ("t1/l0[5|1]"), and the source track could not '
            "be read from `path` (absent, or several tracks). Name the "
            "destination track yourself."
        )

        return

    args.pop("takeLane", None)
    _set(args, "toPath", _position_paths(args, "arrangementStart", track, lane))


def _migrate_select(args, notes=None):
    _migrate_slot(args, "slot", "path")
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
    "ppal-create-track": _migrate_track_target,
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

    for position in _split_list(_take(args, key)):
        parts = dict(track)
        parts.update(takeLane=take_lane, position=position)
        paths.append(build_path(parts))

    return ",".join(paths)


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


def _take_scene(args):
    scene_index = _take(args, "sceneIndex")

    return {} if scene_index is None else {"sceneIndex": scene_index}


def _lane_index(value):
    """Convert a 1-based takeLane to the 0-based `l<n>` path segment.

    takeLane counted from 1 and the path segment counts from 0, so this is off
    by one everywhere -- and takeLane 0 named the main lane, which is no take
    lane at all rather than lane 0. Returns None for anything that names no
    lane.
    """
    if value is None or value == "":
        return None
    if str(value).lower() == "new":
        return "new"

    try:
        lane = int(value)
    except (TypeError, ValueError):
        return None

    return None if lane < 1 else lane - 1


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

# Every row was run against Live 12.4 on 2.3: `before` and `after` produce the
# same result, and `before` also emits the deprecation warning it migrates off.
CASES = [
    ("ppal-read-track", {"trackIndex": 2}, {"path": "t2"}),
    (
        "ppal-read-track",
        {"trackIndex": 0, "trackType": "return"},
        {"path": "rt0"},
    ),
    ("ppal-select", {"trackType": "master"}, {"path": "mt"}),
    ("ppal-create-track", {"trackIndex": -1}, {"path": "t+"}),
    (
        "ppal-update-track",
        {"outputRoutingTypeId": "2"},
        {"outputRoutingType": "2"},
    ),
    ("ppal-read-scene", {"sceneIndex": 2}, {"path": "s2"}),
    ("ppal-read-clip", {"slot": "1/0"}, {"path": "t1/s0"}),
    ("ppal-select", {"devicePath": "t6/d0"}, {"path": "t6/d0"}),
    (
        "ppal-playback",
        {"action": "play-session-clips", "slots": "0/0,1/0"},
        {"action": "play-session-clips", "path": "t0/s0,t1/s0"},
    ),
    (
        "ppal-playback",
        {"action": "play-arrangement", "startLocator": "Chorus"},
        {"action": "play-arrangement", "startTime": "loc:Chorus"},
    ),
    (
        "ppal-create-clip",
        {"trackIndex": 1, "arrangementStart": "33|1,37|1"},
        {"path": "t1[33|1],t1[37|1]"},
    ),
    (
        "ppal-create-clip",
        {"trackIndex": 1, "arrangementStart": "21|1", "takeLane": "new"},
        {"path": "t1/l+[21|1]"},
    ),
    (
        "ppal-duplicate",
        {
            "type": "clip",
            "path": "t1/s0",
            "takeLane": "1",
            "arrangementStart": "17|1",
        },
        {"type": "clip", "path": "t1/s0", "toPath": "t1/l0[17|1]"},
    ),
    (
        "ppal-duplicate",
        {"type": "clip", "path": "t1/s0", "locator": "Chorus"},
        {"type": "clip", "path": "t1/s0", "toPath": "[loc:Chorus]"},
    ),
    (
        "ppal-update-clip",
        {"path": "t1[41|1],t1[45|1]", "arrangementStart": "49|1,53|1"},
        {"path": "t1[41|1],t1[45|1]", "toPath": "[49|1],[53|1]"},
    ),
    (
        "ppal-update-clip",
        {"path": "t1/s0", "toSlot": "2/5"},
        {"path": "t1/s0", "toPath": "t2/s5"},
    ),
]


def self_test():
    failed = 0

    for tool, before, expected in CASES:
        args, _notes = migrate_args(tool, before)

        if args != expected:
            failed += 1
            print("FAIL %s %s" % (tool, json.dumps(before)), file=sys.stderr)
            print("  want %s" % json.dumps(expected), file=sys.stderr)
            print("  got  %s" % json.dumps(args), file=sys.stderr)

    # A path survives a round trip through its parts, which is the property the
    # adapter leans on everywhere it edits one piece of a path.
    for path in ("t0", "rt1", "mt", "t+", "t0/s3", "t1/l0[17|1]"):
        round_trip = build_path(parse_path(path))

        if round_trip != path:
            failed += 1
            print("FAIL round trip %s -> %s" % (path, round_trip), file=sys.stderr)

    print(
        "%d cases + round trips OK" % len(CASES)
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
    args, notes = migrate_args(tool_name, json.loads(raw))

    print(json.dumps(args, indent=2))

    for note in notes:
        print("note: " + note, file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
