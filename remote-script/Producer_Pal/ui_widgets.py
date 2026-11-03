# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""The generative UI's widget list, kept in the Live Set with the song's own
data store (`song.set_data` / `song.get_data`). Main thread only.

The store is saved in the .als, adds no undo step, and survives reopening. It
doesn't mark the Set as changed, so a widget-only change is lost if the user
quits without saving. The list is an opaque string: Node owns the format.
"""

from .errors import RouteError

# The one key the list lives under.
KEY = "producer_pal_ui_widgets"

# The most characters kept, so the list can't bloat the .als.
MAX_CHARS = 24_000


def read_route(bridge, params):
    """`GET /ui-widgets`: `{text}`, the saved list or null when none."""
    text = bridge.song.get_data(KEY, None)
    return {"text": text if isinstance(text, str) else None}


def save_route(bridge, params):
    """`POST /ui-widgets/save`: `text`, the list to keep."""
    text = params.get("text")
    if not isinstance(text, str):
        raise RouteError(400, "text must be a string")
    if len(text) > MAX_CHARS:
        raise RouteError(
            413,
            "text is %d characters, the most kept is %d" % (len(text), MAX_CHARS),
            limit=MAX_CHARS,
        )
    bridge.song.set_data(KEY, text)
    return {"ok": True}


ROUTES = {
    "/ui-widgets": read_route,
    "/ui-widgets/save": save_route,
}

# The route that changes the Set refuses GET.
POST_ONLY = ("/ui-widgets/save",)
