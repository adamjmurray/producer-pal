# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""A Simpler's pitch bend ranges. Max for Live's LOM doesn't have them; Live's
Python API does, as `SimplerDevice.pitch_bend_range` (semitones the pitch wheel
bends, 0-24) and `note_pitch_bend_range` (MPE per-note bend, 0-48). Both are
ints. Live clamps an out-of-range write silently, so writes are checked here.

Also turns a sliced Simpler into a Drum Rack, which only `Live.Conversions` can
do. See dev/live-api/conversions.md.

Main thread only."""

import Live

from . import hotswap
from .errors import RouteError
from .params import parse_device_paths, parse_whole

# Simpler's class_name, as Max reports it too.
SIMPLER_CLASS = "OriginalSimpler"

# Simpler's `playback_mode` when it plays slices.
SLICING_MODE = 2

# Each setting's inclusive range.
RANGES = {"pitch_bend_range": (0, 24), "note_pitch_bend_range": (0, 48)}


def read(bridge, params):
    """The pitch bend ranges of each Simpler in `device_paths`, in order.

    Each entry is `{pitch_bend_range, note_pitch_bend_range}`, or `{error}`
    when the path names nothing or a device that isn't a Simpler. One bad path
    doesn't fail the rest.
    """
    paths = parse_device_paths(params)

    return {"simplers": [_read_one(bridge.song, path) for path in paths]}


def write(bridge, params):
    """Set one Simpler's `pitch_bend_range`, `note_pitch_bend_range` or both.

    Answers both values as Live reads them back. A value outside its range, or
    one that isn't a whole number, is a 400 and nothing is written.
    """
    wanted = {}
    for name, (low, high) in RANGES.items():
        if params.get(name) is not None:
            wanted[name] = parse_whole(params[name], name, low, high)
    if not wanted:
        raise RouteError(400, "pass pitch_bend_range, note_pitch_bend_range or both")

    device = _simpler_at(bridge.song, params.get("device_path"))
    done = {}
    for name, value in wanted.items():
        try:
            setattr(device, name, value)
        except Exception:
            # Not the exception's own text: it names Python classes.
            raise RouteError(500, _failed(name, done))
        done[name] = value

    try:
        return _settings(device)
    except Exception:
        raise RouteError(500, _failed("read-back", done))


def to_drum_rack(bridge, params):
    """Replace a sliced Simpler with a Drum Rack, one pad per slice.

    Live does it before the call returns, in the Simpler's place. Answers how
    many pads the rack has.

    Never load a sample here: Live crashes when a Simpler's sample is replaced
    and converted in the same main-thread call.
    """
    device_path = params.get("device_path")
    device = _simpler_at(bridge.song, device_path)
    if int(device.playback_mode) != SLICING_MODE:
        raise RouteError(409, "the Simpler isn't in slicing mode")

    convert = getattr(getattr(Live, "Conversions", None), "sliced_simpler_to_drum_rack", None)
    if convert is None:
        raise RouteError(409, "this Live version can't convert a Simpler's slices")
    try:
        convert(bridge.song, device)
    except RuntimeError as err:
        raise RouteError(409, "Live refused the conversion: %s" % err)

    try:
        return {"pads": len(hotswap.device_at(bridge.song, device_path).chains)}
    except Exception:
        raise RouteError(500, "converted, but Live couldn't read the Drum Rack back")


def _failed(name, done):
    """What went wrong, and which settings were already written."""
    what = (
        "Live couldn't read the settings back"
        if name == "read-back"
        else "Live refused to set %s" % name
    )
    if not done:
        return what
    landed = ", ".join("%s to %s" % item for item in done.items())
    return "%s, after %s was set" % (what, landed)


def _read_one(song, device_path):
    try:
        return _settings(_simpler_at(song, device_path))
    except RouteError as err:
        return {"error": str(err)}
    except Exception:
        return {"error": "Live couldn't read it"}


def _simpler_at(song, device_path):
    try:
        device = hotswap.device_at(song, device_path)
    except hotswap.DevicePathError as err:
        raise RouteError(400, str(err))

    if getattr(device, "class_name", None) != SIMPLER_CLASS:
        raise RouteError(
            400, "%r is not a Simpler" % getattr(device, "name", device_path)
        )
    return device


def _settings(device):
    return {name: getattr(device, name) for name in RANGES}


ROUTES = {
    "/device/simpler/read": read,
    "/device/simpler/write": write,
    "/device/simpler/to-drum-rack": to_drum_rack,
}
