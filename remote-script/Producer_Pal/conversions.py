# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""Make a new track from an audio clip: what Live's "Convert ... to New MIDI
Track" menu and Push's Convert button do. Max for Live can't reach `Live.Conversions`.

Live starts the work and returns at once, then does it on a later tick, blocking
Live for about a second. So the route answers before the new track exists, and
says nothing about where it lands: the caller finds it by comparing the track
list from before. See dev/live-api/conversions.md.
"""

import Live

from .clip_address import clip_in_track, regular_track
from .errors import RouteError

# `type` -> the AudioToMidiType member, for the kinds that make a MIDI clip.
AUDIO_TO_MIDI = {
    "harmony": "harmony_to_midi",
    "melody": "melody_to_midi",
    "drums": "drums_to_midi",
}
# The kinds that load the clip into an instrument and make no clip.
INSTRUMENT_KINDS = ("simpler", "drum-rack")
KINDS = tuple(AUDIO_TO_MIDI) + INSTRUMENT_KINDS

# What each kind calls on `Live.Conversions`. An older Live may lack some.
FUNCTIONS = {
    "simpler": "create_midi_track_with_simpler",
    "drum-rack": "create_drum_rack_from_audio_clip",
}
CANT_CONVERT = "this Live version can't convert clips"


def convert(bridge, params):
    """Start converting one audio clip. The new track appears a moment later."""
    kind = params.get("type")
    if kind not in KINDS:
        raise RouteError(400, "type must be one of %s, got %r" % (", ".join(KINDS), kind))

    song = bridge.song
    clip = clip_in_track(regular_track(song, params.get("track")), params)
    # Asked of a MIDI clip, is_convertible_to_midi raises instead of answering.
    if not clip.is_audio_clip:
        raise RouteError(409, "only an audio clip can be converted")

    if clip.is_recording:
        raise RouteError(409, "a clip that is recording can't be converted")

    conversions = getattr(Live, "Conversions", None)
    needed = FUNCTIONS.get(kind, "audio_to_midi_clip")
    if conversions is None or not hasattr(conversions, needed):
        raise RouteError(409, CANT_CONVERT)
    try:
        if kind in AUDIO_TO_MIDI:
            types = getattr(conversions, "AudioToMidiType", None)
            if not hasattr(types, AUDIO_TO_MIDI[kind]) or not hasattr(
                conversions, "is_convertible_to_midi"
            ):
                raise RouteError(409, CANT_CONVERT)
            if not conversions.is_convertible_to_midi(song, clip):
                raise RouteError(409, "Live can't convert this clip to MIDI")
            conversions.audio_to_midi_clip(
                song, clip, getattr(types, AUDIO_TO_MIDI[kind])
            )
        else:
            getattr(conversions, FUNCTIONS[kind])(song, clip)
    except RuntimeError as err:
        raise RouteError(409, "Live refused the conversion: %s" % err)

    return {"started": True, "type": kind}


ROUTES = {"/clip/convert": convert}
