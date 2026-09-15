# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: GPL-3.0-or-later

"""Finding things in Live's browser. Main thread only."""

MAX_DEPTH = 8

# The `type` param: the app.browser attribute holding that tree, and whether to
# keep only devices. Live's own sections mix devices with their presets, but
# plugins aren't flagged as devices at all.
TYPES = {
    "mfl-device": ("max_for_live", True),
    "audio-effect": ("audio_effects", True),
    "instrument": ("instruments", True),
    "midi-effect": ("midi_effects", True),
    "plugin": ("plugins", False),
}

# Browser names that are really filenames.
_SUFFIXES = (".amxd", ".adg", ".adv")


class PathNotFound(LookupError):
    def __init__(self, walked, segment, choices):
        where = "/".join(walked) or "the top level"
        super().__init__("no %r in %s" % (segment, where))
        self.choices = choices


def type_root(app, item_type):
    """The browser tree for a `type` param value, and whether to keep only devices."""
    if item_type not in TYPES:
        raise ValueError(
            "type must be one of: %s (got %r)" % (", ".join(sorted(TYPES)), item_type)
        )
    category, devices_only = TYPES[item_type]
    return getattr(app.browser, category), devices_only


def resolve_path(root, path):
    """The item at a "/"-separated path under `root`, plus its canonical path.

    Segments match case-insensitively. Raises PathNotFound listing the choices.
    """
    item = root
    walked = []
    for segment in _split(path):
        wanted = segment.lower()
        children = list(item.children)
        match = next((child for child in children if child.name.lower() == wanted), None)
        if match is None:
            raise PathNotFound(walked, segment, [child.name for child in children])
        item = match
        walked.append(match.name)
    return item, "/".join(walked)


def list_children(item, path, query=None):
    """One level below `item`: folders and loadable items, for drilling down."""
    found = []
    for child in item.children:
        if _matches(child, query):
            found.append(
                {
                    "name": child.name,
                    "path": _join(path, child.name),
                    "loadable": bool(child.is_loadable),
                    "has_children": len(child.children) > 0,
                }
            )
    return found


def list_loadable(item, path, devices_only, query=None):
    """Every loadable item at any depth below `item`."""
    return [
        {"name": child.name, "path": child_path}
        for child, child_path in iter_loadable(item, path, devices_only)
        if _matches(child, query)
    ]


def iter_loadable(item, path, devices_only, depth=0):
    """(item, path) pairs for every loadable item below `item`.

    Descends into anything with children, not only is_folder items, but never
    into a device: its children are its presets.
    """
    if depth > MAX_DEPTH:
        return
    for child in item.children:
        child_path = _join(path, child.name)
        if child.is_device:
            yield child, child_path
            continue
        if child.is_loadable and not devices_only:
            yield child, child_path
        yield from iter_loadable(child, child_path, devices_only, depth + 1)


def match_items(root, name, devices_only):
    """(item, path) pairs matching `name`.

    Exact names win outright; only when there are none does this fall back to
    substring matches, which the caller has to disambiguate.
    """
    wanted = _normalize(name)
    exact = []
    partial = []
    for item, path in iter_loadable(root, "", devices_only):
        normalized = _normalize(item.name)
        if normalized == wanted:
            exact.append((item, path))
        elif wanted in normalized:
            partial.append((item, path))
    return exact or partial


def _matches(item, query):
    return not query or query.lower() in item.name.lower()


def _normalize(name):
    lowered = name.strip().lower()
    for suffix in _SUFFIXES:
        if lowered.endswith(suffix):
            return lowered[: -len(suffix)]
    return lowered


def _split(path):
    return [segment.strip() for segment in (path or "").split("/") if segment.strip()]


def _join(path, name):
    return path + "/" + name if path else name
