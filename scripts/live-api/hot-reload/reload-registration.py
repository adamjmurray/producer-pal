# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: GPL-3.0-or-later

# Dev-only, added by `npm run remote-script:install -- --probe`.
from .hot_reload import reload_route as _reload_route  # noqa: E402
ROUTES["/reload"] = _reload_route
POST_ONLY = POST_ONLY + ("/reload",)
