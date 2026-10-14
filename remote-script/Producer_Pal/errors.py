# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""The error a route raises to set its own HTTP status and body.

Never hot-reloaded: the bridge catches this class, and a reloaded copy would be
a different class from the one a request queued before the reload raises.
"""


class RouteError(Exception):
    """A route's own HTTP status and body."""

    def __init__(self, status, message, **extra):
        super().__init__(message)
        self.status = status
        self.payload = dict(extra, error=message)
