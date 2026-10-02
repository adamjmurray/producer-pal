# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: GPL-3.0-or-later

"""Loading a browser item in place of a device already in the Set. Main thread only."""

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

# Live.Device.DeviceType values, named the way /load names kinds.
_DEVICE_KINDS = {1: "instrument", 2: "audio-effect", 4: "midi-effect"}


class DevicePathError(ValueError):
    pass


def device_at(song, device_path):
    """The device at a Live path, e.g. 'live_set tracks 2 devices 0 chains 1 devices 0'."""
    words = str(device_path or "").replace('"', " ").split()
    if words[:1] == ["live_set"]:
        words = words[1:]
    if words[-2:-1] != ["devices"]:
        raise DevicePathError("device_path must end in 'devices <index>'")

    obj = song
    i = 0
    while i < len(words):
        word = words[i]
        if word not in _PATH_WORDS:
            raise DevicePathError("device_path can't contain %r" % word)
        obj = getattr(obj, word)
        i += 1
        if _PATH_WORDS[word]:
            obj = _nth(obj, word, words[i] if i < len(words) else None)
            i += 1
    return obj


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
    return device_at(song, device_path)


def _nth(items, word, index_word):
    try:
        index = int(index_word)
    except (TypeError, ValueError):
        raise DevicePathError("device_path needs an index after %r" % word)
    items = list(items)
    if index < 0 or index >= len(items):
        raise DevicePathError("device_path has nothing at %s %s" % (word, index))
    return items[index]
