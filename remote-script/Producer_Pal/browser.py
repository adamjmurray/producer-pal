# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""Finding things in Live's browser. Main thread only."""

import os
from urllib.parse import unquote

try:
    import unicodedata
except ImportError:  # not confirmed in every Live build; only accents need it
    unicodedata = None

MAX_DEPTH = 8

# How many folders an ambiguous-file error names.
MAX_LISTED = 5

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


def user_library():
    """The User Library this script was installed into, or None when it
    isn't running from one (a dev checkout)."""
    return _USER_LIBRARY


# How a Places folder's `uri` starts. Packs' URIs carry no disk path.
_USERFOLDER = "userfolder:"


class PathNotFound(LookupError):
    def __init__(self, walked, segment, choices):
        where = "/".join(walked) or "the top level"
        super().__init__("no %r in %s" % (segment, where))
        self.choices = choices


class AmbiguousFile(LookupError):
    """Several name-matched folders could hold the file.

    The message names them by `uri` (a pack's is the only thing telling two
    same-named packs apart). Browser paths can't be passed back: a `preset`
    only takes a device section or a disk path.
    """

    def __init__(self, file_path, matches):
        listed = [
            "%s %r (%s)" % (label, name, uri) if uri else "%s %r" % (label, name)
            for label, name, uri in matches[:MAX_LISTED]
        ]
        if len(matches) > MAX_LISTED:
            listed.append("%d more" % (len(matches) - MAX_LISTED))
        super().__init__(
            "%r could be in %d folders Live can't tell apart by location: %s. "
            "Load it from a folder with a unique name."
            % (file_path, len(matches), "; ".join(listed))
        )


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
        wanted = _path_name(segment).lower()
        children = list(item.children)
        match = next(
            (child for child in children if _path_name(child.name).lower() == wanted),
            None,
        )
        if match is None:
            raise PathNotFound(
                walked, segment, [_path_name(child.name) for child in children]
            )
        item = match
        walked.append(_path_name(match.name))
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
    it. The User Library and Places folders are matched by their real location
    (a Places `uri` is `userfolder:<disk path>`). Packs expose no disk path, and
    neither does a Places folder with another `uri`, so those are matched by
    name; if more than one could hold the file, raises AmbiguousFile rather
    than guess. Raises LookupError.
    """
    segments = _forms(file_path)
    library = _forms(_USER_LIBRARY) if _USER_LIBRARY else []
    rest = _below(segments, library)
    if rest is not None:
        found = _walk(browser.user_library, rest)
        if found is not None:
            return found, "/".join(["User Library"] + rest)

    by_name = [("pack", "Packs", root) for root in browser.packs.children]
    for root in browser.user_folders:
        folder = _place_forms(root)
        if folder is None:
            by_name.append(("Places folder", "Places", root))
            continue
        rest = _below(segments, folder)
        if rest is not None:
            found = _walk(root, rest)
            if found is not None:
                return found, "/".join(["Places", _path_name(root.name)] + rest)

    matches = []  # (item, path, kind, root name, uri)
    names = segments[0]
    for kind, label, root in by_name:
        root_name = _path_name(root.name)
        for i, segment in enumerate(names[:-1]):
            if segment.lower() == root_name.lower():
                rest = names[i + 1 :]
                found = _walk(root, rest)
                if found is not None:
                    uri = getattr(root, "uri", None)
                    matches.append(
                        (
                            found,
                            "/".join([label, root_name] + rest),
                            kind,
                            root_name,
                            uri if isinstance(uri, str) else None,
                        )
                    )
                    break
    if len(matches) > 1:
        raise AmbiguousFile(file_path, [m[2:] for m in matches])
    if matches:
        return matches[0][:2]
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
    """The item at `segments` below `root`, or None.

    Live's browser drops the extension from a Max device's name (the file
    `Producer_Pal.amxd` shows as `Producer_Pal`), so a file name with a
    device or preset suffix is tried without it too.
    """
    tries = [segments]
    name = segments[-1] if segments else ""
    for suffix in _SUFFIXES:
        if name.lower().endswith(suffix):
            tries.append(segments[:-1] + [name[: -len(suffix)]])
    for attempt in tries:
        try:
            item, _ = resolve_path(root, "/".join(attempt))
        except PathNotFound:
            continue
        return item
    return None


def _file_segments(path):
    """A file path's folders and name, with either separator, in path form."""
    return [
        _path_name(part) for part in str(path).replace("\\", "/").split("/") if part
    ]


def _forms(path):
    """A path's segment lists: as written, then with symlinks resolved.

    A Place or the file may be given through a link (`/tmp` vs `/private/tmp`).
    """
    path = str(path)
    forms = [_file_segments(path)]
    if os.path.isabs(path):
        resolved = _file_segments(os.path.realpath(path))
        if resolved not in forms:
            forms.append(resolved)
    return forms


def _place_forms(root):
    """A Places folder's real path as segment lists, or None.

    None unless its `uri` is `userfolder:<disk path>`. The path is tried as
    written and %-decoded, since a literal "%" is possible.
    """
    uri = getattr(root, "uri", None)
    if not isinstance(uri, str) or not uri.startswith(_USERFOLDER):
        return None
    raw = uri[len(_USERFOLDER) :]
    forms = []
    for path in (raw, unquote(raw)):
        for form in _forms(path):
            if form and form not in forms:
                forms.append(form)
    return forms


def _below(file_forms, folder_forms):
    """The file's segments below the first folder holding it, or None.

    Compares case-insensitively, like the User Library check always has.
    """
    for folder in folder_forms:
        for segments in file_forms:
            if len(segments) > len(folder) and _lower(segments[: len(folder)]) == _lower(
                folder
            ):
                return segments[len(folder) :]
    return None


def _lower(segments):
    return [segment.lower() for segment in segments]


def _matches(item, query):
    return not query or _path_name(query).lower() in _path_name(item.name).lower()


def _normalize(name):
    lowered = _path_name(name.strip()).lower()
    for suffix in _SUFFIXES:
        if lowered.endswith(suffix):
            return lowered[: -len(suffix)]
    return lowered


def _path_name(name):
    """A name as a path segment: accents composed, "/" written as ":".

    Live shows a ":" in a macOS file name as "/", so a "/" in a name isn't a
    folder break. Writing it as ":" keeps "/" for separators only and gives
    the real file name on disk. Browser names are composed; disk names may not be.
    """
    if unicodedata is not None:
        name = unicodedata.normalize("NFC", name)
    return name.replace("/", ":")


def _split(path):
    return [segment.strip() for segment in (path or "").split("/") if segment.strip()]


def _join(path, name):
    name = _path_name(name)
    return path + "/" + name if path else name
