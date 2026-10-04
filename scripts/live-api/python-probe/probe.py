# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: GPL-3.0-or-later

"""Dev-only /probe route: runs posted Python on Live's main thread.

This is arbitrary code execution over local HTTP, so it must never ship. It
lives outside remote-script/Producer_Pal so the device never bundles it;
add-probe-route.ts copies it into an installed script. A plain
`npm run remote-script:install` removes it.

The code sees `song`, `app`, `Live` and `bridge`, and returns whatever it
assigns to `result`.
"""

import traceback

import Live


def probe(bridge, params):
    scope = {
        "song": bridge.song,
        "app": bridge.app,
        "Live": Live,
        "bridge": bridge,
        "result": None,
    }
    try:
        exec(params.get("code", ""), scope)
        return {"result": _jsonable(scope.get("result"))}
    except Exception:
        return {"error": traceback.format_exc()}


def _jsonable(value, depth=0):
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if depth > 6:
        return repr(value)
    if isinstance(value, dict):
        return {str(k): _jsonable(v, depth + 1) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_jsonable(v, depth + 1) for v in value]
    return repr(value)
