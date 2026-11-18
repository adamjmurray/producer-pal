# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""Spike: set many params of one device in one undo step, and time it, to
compare with Max's LiveAPI (about 5-6 ms a param). Main thread only."""

import time

from . import hotswap


def set_params(bridge, params):
    """Set `values` ([[param index, value], ...]) on `device_path`.

    With `skip_automated`, leaves params that have automation alone: setting
    one would override it.
    """
    device = hotswap.device_at(bridge.song, params.get("device_path"))
    values = params.get("values") or []
    group = params.get("undo", True)
    skip_automated = params.get("skip_automated", False)
    skipped = 0
    song = bridge.song
    started = time.perf_counter()

    if group:
        song.begin_undo_step()
    try:
        parameters = device.parameters
        for index, value in values:
            parameter = parameters[int(index)]
            if skip_automated and parameter.automation_state != 0:
                skipped += 1
                continue
            parameter.value = float(value)
    finally:
        if group:
            song.end_undo_step()

    return {"set": len(values) - skipped, "skipped": skipped, "ms": round((time.perf_counter() - started) * 1000, 2)}


ROUTES = {"/spike/set-params": set_params}
