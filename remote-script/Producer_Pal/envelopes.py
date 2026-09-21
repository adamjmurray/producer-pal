# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: GPL-3.0-or-later

"""Clip automation envelopes.

Max for Live's LOM can't reach clip envelopes; Live's Python API can, for
Session clips only. Arrangement clips raise on write and read as empty, so a
Session clip is the only way in - duplicate it to the Arrangement afterwards.

Units: writes, `value_at_time` and `parameter.value` are raw `min..max`;
`events_in_range` reports the parameter's display scale (Hz, dB). Times are
beats (quarter notes) from the clip start.
"""

import math
import re

from .routes import RouteError

MAX_EVENTS = 1000
EPSILON = 1e-6


def list_envelopes(bridge, params):
    """Every parameter this clip automates, with its event count."""
    track = _track(bridge.song, params.get("track"))
    clip = _clip(track, params)
    out = []
    if clip.has_envelopes:
        for target, param in _automatable(track):
            env = clip.automation_envelope(param)
            if env is not None:
                out.append(
                    dict(
                        target,
                        parameter=_describe(param),
                        event_count=len(list(env.events_in_range(0, clip.length))),
                    )
                )
    return {"envelopes": out}


def read(bridge, params):
    """One envelope's events between `from` and `to` (beats), up to `limit`."""
    track = _track(bridge.song, params.get("track"))
    param = _parameter(track, params)
    clip = _clip(track, params)
    env = clip.automation_envelope(param)
    if env is None:
        return {"exists": False, "parameter": _describe(param)}

    start = _num(params.get("from", 0))
    end = _num(params.get("to", clip.length))
    limit = min(int(params.get("limit", MAX_EVENTS)), MAX_EVENTS)
    events = list(env.events_in_range(start, end))
    out = []
    for i, event in enumerate(events[:limit]):
        # Two events can share a time (a step). value_at_time at that time
        # gives the earlier one, so sample just after it for the later.
        follows_same_time = i > 0 and events[i - 1].time == event.time
        raw = env.value_at_time(event.time + EPSILON if follows_same_time else event.time)
        out.append(
            {
                "time": event.time,
                "value": raw,
                "display": event.value,
                "display_str": param.str_for_value(raw),
            }
        )
    return {
        "exists": True,
        "parameter": _describe(param),
        "from": start,
        "to": end,
        "event_count": len(events),
        "events": out,
        "truncated": len(events) > limit,
    }


def write(bridge, params):
    """Replace the envelope with `points` (raw values), stepped or linear."""
    song = bridge.song
    track = _track(song, params.get("track"))
    param = _parameter(track, params)
    clip = _clip(track, params)
    if not param.is_enabled:
        raise RouteError(409, "parameter is disabled or controlled by a macro")

    points = _points(params, param)
    shape = params.get("shape", "linear")
    if shape not in ("steps", "linear"):
        raise RouteError(400, "shape must be steps or linear")

    song.begin_undo_step()
    try:
        if clip.automation_envelope(param) is not None:
            clip.clear_envelope(param)
        env = clip.create_automation_envelope(param)
        if shape == "linear":
            from Live.Envelope import EnvelopeEvent

            for t, v in points:
                env.create_event(EnvelopeEvent(t, v))
        else:
            for (t, v), (t2, _) in zip(points, points[1:]):
                env.insert_step(t, t2 - t, v)
            # A zero-length step is a no-op, so hold the last value to the end.
            last_t, last_v = points[-1]
            end = max(clip.end_marker, clip.loop_end, last_t + 1)
            env.insert_step(last_t, end - last_t, last_v)
    finally:
        song.end_undo_step()

    # At a step's own time value_at_time still reads the old value.
    after = EPSILON if shape == "steps" else 0
    return {
        "parameter": _describe(param),
        "shape": shape,
        "samples": [{"time": t, "value": env.value_at_time(t + after)} for t, _ in points],
    }


def clear(bridge, params):
    """Remove one envelope, or every envelope when no parameter is given."""
    track = _track(bridge.song, params.get("track"))
    clip = _clip(track, params)
    if "parameter" not in params and "device" not in params:
        had = bool(clip.has_envelopes)
        clip.clear_all_envelopes()
        return {"cleared": had, "all": True}
    param = _parameter(track, params)
    had = clip.automation_envelope(param) is not None
    if had:
        clip.clear_envelope(param)
    return {"cleared": had}


# --- resolving ---------------------------------------------------------


def _track(song, path):
    if path == "mt":
        return song.master_track
    m = re.fullmatch(r"(rt|t)(\d+)", str(path or ""))
    if not m:
        raise RouteError(400, "track must be t0, rt0 or mt")
    tracks = song.return_tracks if m[1] == "rt" else song.tracks
    i = int(m[2])
    if i >= len(tracks):
        raise RouteError(404, "no track %s" % path)
    return tracks[i]


def _clip(track, params):
    if "slot" in params:
        i = int(params["slot"])
        if i >= len(track.clip_slots):
            raise RouteError(404, "no slot %s" % i)
        slot = track.clip_slots[i]
        if not slot.has_clip:
            raise RouteError(404, "slot %s is empty" % i)
        return slot.clip
    if "arrangement_index" in params:
        i = int(params["arrangement_index"])
        if i >= len(track.arrangement_clips):
            raise RouteError(404, "no arrangement clip %s" % i)
        return track.arrangement_clips[i]
    raise RouteError(400, "give slot or arrangement_index")


def _device(track, path):
    """Walk d0, d0/c1/d0... to a device or chain."""
    obj = track
    for part in str(path).split("/"):
        m = re.fullmatch(r"([dc])(\d+)", part)
        if not m:
            raise RouteError(400, "device must be d0, or d0/c0/d1 for rack chains")
        children = obj.devices if m[1] == "d" else obj.chains
        i = int(m[2])
        if i >= len(children):
            raise RouteError(404, "no %s in %s" % (part, path))
        obj = children[i]
    return obj


def _parameter(track, params):
    """A device parameter by name or index, or a mixer parameter by name."""
    name = params.get("parameter", "volume")
    if params.get("device"):
        device = _device(track, params["device"])
        parameters = list(device.parameters)
        if isinstance(name, int) or str(name).isdigit():
            i = int(name)
            if i >= len(parameters):
                raise RouteError(404, "no parameter %s" % i)
            return parameters[i]
        hits = [p for p in parameters if p.name.casefold() == str(name).casefold()]
        if len(hits) != 1:
            raise RouteError(
                400,
                "parameter must match exactly one name",
                available=[p.name for p in parameters],
            )
        return hits[0]
    mixer = track.mixer_device
    if name == "volume":
        return mixer.volume
    if name == "pan":
        return mixer.panning
    m = re.fullmatch(r"send(\d+)", str(name))
    if m and int(m[1]) < len(mixer.sends):
        return mixer.sends[int(m[1])]
    raise RouteError(400, "mixer parameter must be volume, pan or send0..")


def _automatable(track):
    """(target, parameter) for every mixer and device parameter on the track."""
    mixer = track.mixer_device
    yield {"parameter_name": "volume"}, mixer.volume
    yield {"parameter_name": "pan"}, mixer.panning
    for i, send in enumerate(mixer.sends):
        yield {"parameter_name": "send%d" % i}, send
    for path, device in _devices(track, ""):
        for i, param in enumerate(device.parameters):
            yield {"device": path, "parameter_index": i}, param


def _devices(holder, prefix):
    for i, device in enumerate(holder.devices):
        path = "%sd%d" % (prefix, i)
        yield path, device
        if getattr(device, "can_have_chains", False):
            for j, chain in enumerate(device.chains):
                for found in _devices(chain, "%s/c%d/" % (path, j)):
                    yield found


# --- values -------------------------------------------------------------


def _describe(p):
    return {
        "name": p.name,
        "min": p.min,
        "max": p.max,
        "value": p.value,
        "display": p.str_for_value(p.value),
        "quantized": bool(p.is_quantized),
        "enabled": bool(p.is_enabled),
        "automation_state": int(p.automation_state),
    }


def _num(v):
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
        raise RouteError(400, "expected a finite number, got %r" % (v,))
    return float(v)


def _points(params, param):
    raw = params.get("points") or []
    if not 1 <= len(raw) <= MAX_EVENTS:
        raise RouteError(400, "give 1 to %d points" % MAX_EVENTS)
    points = [(_num(p.get("time")), _num(p.get("value"))) for p in raw]
    if points[0][0] < 0 or any(b[0] <= a[0] for a, b in zip(points, points[1:])):
        raise RouteError(400, "times must be >= 0 and strictly increasing")
    for _, v in points:
        if not param.min <= v <= param.max:
            raise RouteError(
                400, "value %s is outside %s..%s" % (v, param.min, param.max)
            )
    return points


ROUTES = {
    "/envelope/list": list_envelopes,
    "/envelope/read": read,
    "/envelope/write": write,
    "/envelope/clear": clear,
}
