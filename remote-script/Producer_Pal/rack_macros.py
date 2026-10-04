# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: GPL-3.0-or-later

"""Which of a rack's macros are mapped. Max for Live's LOM can't say; Live's
Python API can, through `RackDevice.macros_mapped`. Main thread only."""

from . import hotswap
from .errors import RouteError

# One call covers a whole read; this only stops a runaway request.
MAX_DEVICES = 200


def macros(bridge, params):
    """The mapped macros of each rack in `device_paths`, in order.

    Each entry is `{mapped: [macro numbers, 1-based]}`, or `{error}` when the
    path names nothing or a device that isn't a rack. One bad path doesn't fail
    the rest.
    """
    paths = params.get("device_paths")
    if not isinstance(paths, list) or not paths:
        raise RouteError(400, "device_paths must be a non-empty list of device paths")
    if len(paths) > MAX_DEVICES:
        raise RouteError(400, "device_paths takes at most %s paths" % MAX_DEVICES)

    return {"racks": [_mapped_macros(bridge.song, path) for path in paths]}


def _mapped_macros(song, device_path):
    try:
        device = hotswap.device_at(song, device_path)
    except hotswap.DevicePathError as err:
        return {"error": str(err)}

    # Only a rack has macros.
    flags = getattr(device, "macros_mapped", None)
    if flags is None:
        return {"error": "%r is not a rack" % getattr(device, "name", device_path)}

    return {"mapped": [number for number, mapped in enumerate(flags, 1) if mapped]}


ROUTES = {"/device/macros": macros}
