# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""The experimental generative UI's routes, in one place.

Only a gen-UI build (`ENABLE_GEN_UI=true`) ships this file, `watches.py` and
`ui_widgets.py`. `routes.py` imports this module if it is there, and this is the
only module that imports the other two: shipped code must never depend on them.
"""

from .ui_widgets import POST_ONLY as _UI_WIDGET_POST_ONLY
from .ui_widgets import ROUTES as _UI_WIDGET_ROUTES
from .watches import POST_ONLY as _WATCH_POST_ONLY
from .watches import ROUTES as _WATCH_ROUTES

ROUTES = {
    **_UI_WIDGET_ROUTES,
    **_WATCH_ROUTES,
}

POST_ONLY = (
    *_UI_WIDGET_POST_ONLY,
    *_WATCH_POST_ONLY,
)
