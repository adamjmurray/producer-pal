# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""Finding a device by its Live path, and loading a browser item in place of one
already in the Set. Main thread only."""

# The words a device path may walk, and whether each is a list (followed by an
# index) or a single object.
_PATH_WORDS = {
    "tracks": True,
    "return_tracks": True,
    "master_track": False,
    "devices": True,
    "chains": True,
    "return_chains": True,
    "drum_pads": True,
}

# The words a device path may start with, after `live_set`.
_PATH_ROOTS = ("tracks", "return_tracks", "master_track")

# Live.Device.DeviceType values, named the way /load names kinds.
_DEVICE_KINDS = {1: "instrument", 2: "audio-effect", 4: "midi-effect"}


class DevicePathError(ValueError):
    pass


def device_at(song, device_path):
    """The device at a Live path, e.g. 'live_set tracks 2 devices 0 chains 1 devices 0'."""
    return locate_device(song, device_path)[2]


def locate_device(song, device_path):
    """(holder, index, device) for a Live path.

    `holder` is the track, chain or drum chain whose `devices` list holds it.
    """
    words = str(device_path or "").replace('"', " ").split()
    if words[:1] == ["live_set"]:
        words = words[1:]
    if words[-2:-1] != ["devices"]:
        raise DevicePathError("device_path must end in 'devices <index>'")
    if words[0] not in _PATH_ROOTS:
        raise DevicePathError(
            "device_path must start with one of %s (after 'live_set')"
            % ", ".join(_PATH_ROOTS)
        )

    obj = song
    holder = None
    i = 0
    while i < len(words):
        word = words[i]
        if word not in _PATH_WORDS:
            raise DevicePathError("device_path can't contain %r" % word)
        holder = obj
        try:
            obj = getattr(obj, word)
        except AttributeError:
            # e.g. 'chains' on a device that isn't a rack
            raise DevicePathError("device_path has nothing at %r here" % word)
        i += 1
        if _PATH_WORDS[word]:
            index, obj = _nth(obj, word, words[i] if i < len(words) else None)
            i += 1
    return holder, index, obj


def device_kind(device):
    """'instrument', 'audio-effect', 'midi-effect', or None."""
    return _DEVICE_KINDS.get(int(device.type))


def hotswap(browser, item, device, device_path, song):
    """Load `item` in place of `device`, and return the device there afterwards.

    A preset for the same device keeps the device; anything else (another
    device, a rack) replaces it. Live does nothing for a different kind of
    device, so check kinds first.
    """
    browser.hotswap_target = device
    try:
        browser.load_item(item)
    finally:
        # Left on, Live keeps filtering the browser to this device, and the
        # next load replaces it instead of adding a device.
        browser.hotswap_target = None
    # Live 12.4.6 finishes a plug-in or Max device load inside load_item, so the
    # device is already in place here.
    return device_at(song, device_path)


def _nth(items, word, index_word):
    """(index, item) for the index a path word is followed by."""
    try:
        index = int(index_word)
    except (TypeError, ValueError):
        raise DevicePathError("device_path needs an index after %r" % word)
    items = list(items)
    if index < 0 or index >= len(items):
        raise DevicePathError("device_path has nothing at %s %s" % (word, index))
    return index, items[index]
