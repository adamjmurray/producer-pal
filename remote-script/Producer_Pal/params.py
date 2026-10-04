# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: GPL-3.0-or-later

"""Reading request params."""

from .errors import RouteError


def parse_index(value, name):
    """A whole number >= 0, or None when absent. Anything else is a 400."""
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        raise RouteError(400, "%s must be a whole number, got %r" % (name, value))
    try:
        index = int(str(value).strip())
    except ValueError:
        raise RouteError(400, "%s must be a whole number, got %r" % (name, value))
    if index < 0:
        raise RouteError(400, "%s must be 0 or more, got %s" % (name, index))
    return index
