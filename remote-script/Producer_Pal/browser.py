# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: GPL-3.0-or-later

"""Finding things in Live's browser. Main thread only."""

import os

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

# The install puts this file in <User Library>/Remote Scripts/Producer_Pal.
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_USER_LIBRARY = (
    os.path.dirname(os.path.dirname(_SCRIPT_DIR))
    if os.path.basename(os.path.dirname(_SCRIPT_DIR)) == "Remote Scripts"
    else None
)


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


def list_presets(item, path, query=None):
    """Every preset at any depth below `item`."""
    return [
        {"name": child.name, "path": child_path}
        for child, child_path in iter_presets(item, path)
        if _matches(child, query)
    ]


def iter_presets(item, path, depth=0):
    """(item, path) pairs for every preset below `item`: anything loadable that
    isn't a device. Descends into devices, since their children are presets."""
    if depth > MAX_DEPTH:
        return
    for child in item.children:
        child_path = _join(path, child.name)
        if child.is_loadable and not child.is_device:
            yield child, child_path
        else:
            yield from iter_presets(child, child_path, depth + 1)


def find_file(browser, file_path):
    """The browser item for a file on disk, plus a path naming it.

    The browser has no lookup by file, but its User Library, Packs and Places
    trees mirror folders on disk, so walk the file's path down whichever holds
    it. A pack or Places folder is matched by name. Raises LookupError.
    """
    segments = _file_segments(file_path)
    library = _file_segments(_USER_LIBRARY) if _USER_LIBRARY else None
    if library and _lower(segments[: len(library)]) == _lower(library):
        found = _walk(browser.user_library, segments[len(library) :])
        if found is not None:
            return found, _join("User Library", "/".join(segments[len(library) :]))

    for label, roots in (("Packs", browser.packs.children), ("Places", browser.user_folders)):
        for root in roots:
            wanted = root.name.lower()
            for i, segment in enumerate(segments[:-1]):
                if segment.lower() == wanted:
                    rest = segments[i + 1 :]
                    found = _walk(root, rest)
                    if found is not None:
                        return found, "/".join([label, root.name] + rest)
    raise LookupError(
        "no folder in Live's browser (User Library, Packs, Places) holds %r"
        % file_path
    )


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


def same_name(a, b):
    """True when two names match, ignoring case and a .amxd/.adg/.adv suffix."""
    return _normalize(a).strip() == _normalize(b).strip()


def _walk(root, segments):
    """The item at `segments` below `root`, or None."""
    try:
        item, _ = resolve_path(root, "/".join(segments))
    except PathNotFound:
        return None
    return item


def _file_segments(path):
    """A file path's folders and name, with either separator."""
    return [part for part in str(path).replace("\\", "/").split("/") if part]


def _lower(segments):
    return [segment.lower() for segment in segments]


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
