# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""A device's name and on/off state. Max for Live's LOM can't read either on a
CC Control (it lists no members for it); Live's Python API can, as
`Device.name` and `Device.is_active`. Main thread only."""

from . import hotswap
from .params import parse_device_paths


def basics(bridge, params):
    """The name and on/off state of each device in `device_paths`, in order.

    Each entry is `{name, is_active}`, or `{error}` when the path names nothing
    or Live can't read it. One bad path doesn't fail the rest.
    """
    paths = parse_device_paths(params)

    return {"devices": [_basics_at(bridge.song, path) for path in paths]}


def _basics_at(song, device_path):
    try:
        device = hotswap.device_at(song, device_path)
    except hotswap.DevicePathError as err:
        return {"error": str(err)}

    try:
        return {"name": str(device.name), "is_active": bool(device.is_active)}
    except Exception:
        # Not the exception's own text: it names Python classes.
        return {"error": "Live couldn't read it"}


ROUTES = {"/device/basics": basics}
