# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: GPL-3.0-or-later

"""Copying a device with Live's own duplicate_device. Main thread only.

Max for Live's LOM has no such call. Live puts the copy right after the
original, and keeps its name, parameters and (for a rack) chains. It refuses
instruments, racks of them included.
"""

from . import hotswap
from .errors import RouteError
from .producer_pal_device import holds_producer_pal


def duplicate_device(bridge, params):
    device_path = params.get("device_path")
    try:
        holder, index, device = hotswap.locate_device(bridge.song, device_path)
    except hotswap.DevicePathError as err:
        raise RouteError(400, str(err))

    # Devices can shift while a request waits in the queue.
    expected = params.get("device_name")
    if expected is not None and device.name != expected:
        raise RouteError(
            409, "the device there is now %r, not %r" % (device.name, expected)
        )

    if holds_producer_pal(device):
        raise RouteError(409, "the Producer Pal device can't be duplicated")
    if hotswap.device_kind(device) == "instrument":
        raise RouteError(409, "Live can't duplicate an instrument")

    try:
        holder.duplicate_device(index)
    except RuntimeError as err:
        raise RouteError(409, str(err))

    copy = list(holder.devices)[index + 1]
    return {"device": {"name": copy.name, "index": index + 1}}


ROUTES = {"/device/duplicate": duplicate_device}
