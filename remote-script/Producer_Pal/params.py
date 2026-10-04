# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: GPL-3.0-or-later

"""Reading request params."""

from .errors import RouteError


# One call covers a whole read; this only stops a runaway request.
MAX_DEVICES = 200


def parse_device_paths(params):
    """The non-empty list of device paths a batch route was asked about."""
    paths = params.get("device_paths")
    if not isinstance(paths, list) or not paths:
        raise RouteError(400, "device_paths must be a non-empty list of device paths")
    if len(paths) > MAX_DEVICES:
        raise RouteError(400, "device_paths takes at most %s paths" % MAX_DEVICES)
    return paths


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


def parse_whole(value, name, minimum, maximum):
    """A whole number from `minimum` to `maximum`. Anything else is a 400.

    Live clamps an out-of-range write without saying so, so refuse it here.
    """
    not_whole = RouteError(400, "%s must be a whole number, got %r" % (name, value))
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        raise not_whole
    try:
        number = int(value.strip()) if isinstance(value, str) else value
        whole = int(number)
    except (ValueError, OverflowError):
        raise not_whole
    if whole != number:
        raise not_whole
    if not minimum <= whole <= maximum:
        raise RouteError(
            400, "%s must be %s to %s, got %s" % (name, minimum, maximum, whole)
        )
    return whole
