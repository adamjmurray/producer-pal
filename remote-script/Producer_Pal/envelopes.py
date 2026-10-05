# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""Clip automation envelopes.

Max for Live's LOM can't reach clip envelopes; Live's Python API can, for
Session clips only. Arrangement clips raise on write and read as empty, so a
Session clip is the only way in - duplicate it to the Arrangement afterwards.

Only automation on track and device parameters is reachable: modulation,
clip-level (Gain...) and MIDI CC envelopes are invisible, and
`clear_all_envelopes` leaves them.

Curves: each event carries `control_coefficients` (`x1, y1, x2, y2`), a bezier
that shapes the segment the event starts. Reads return them as a list when they
aren't straight (0.5 four times), and writes take the same list on a point. This
side never interprets them: Node maps them to and from the notation's `~N`.

Units: writes, `value_at_time` and `parameter.value` are raw `min..max`;
`events_in_range` values are Live's own units (linear gain for dB, Hz,
seconds), not raw. Times are beats (quarter notes) from the clip start.
"""

import math
import re

from .clip_address import clip_in_track, regular_track, whole_number
from .errors import RouteError

MAX_EVENTS = 1000
EPSILON = 1e-6
# Live keeps events past the clip end, so a read covers them unless told not to.
MAX_TIME = 1e6
# `automation_state` after the user moves an automated parameter.
OVERRIDDEN = 2
# What Live stores on an event for a straight segment.
STRAIGHT = (0.5, 0.5, 0.5, 0.5)


def list_envelopes(bridge, params):
    """Every parameter this clip automates, with its event count."""
    track = regular_track(bridge.song, params.get("track"))
    clip = clip_in_track(track, params)
    out = [
        dict(
            target,
            parameter=_describe(param),
            event_count=len(list(env.events_in_range(0, MAX_TIME))),
        )
        for target, param, env in _automated(track, clip)
    ]
    return {"envelopes": out}


def read(bridge, params):
    """One envelope's events between `from` and `to` (beats), up to `limit`."""
    track = regular_track(bridge.song, params.get("track"))
    param = _parameter(track, params)
    clip = clip_in_track(track, params)
    env = clip.automation_envelope(param)
    if env is None:
        return {"exists": False, "parameter": _describe(param)}

    start = _num(params.get("from", 0))
    end = _num(params.get("to", MAX_TIME))
    limit = MAX_EVENTS
    if params.get("limit") is not None:
        limit = min(whole_number(params["limit"], "limit", 1), MAX_EVENTS)
    events = list(env.events_in_range(start, end))
    out = []
    for i, event in enumerate(events[:limit]):
        # Two events can share a time (a step). value_at_time at that time
        # gives the earlier one, so sample just after it for the later.
        follows_same_time = i > 0 and events[i - 1].time == event.time
        raw = env.value_at_time(event.time + EPSILON if follows_same_time else event.time)
        item = {
            "time": event.time,
            "value": raw,
            "display": event.value,
            "display_str": param.str_for_value(raw),
        }
        coefficients = _coefficients(event)
        if coefficients != STRAIGHT:
            item["coefficients"] = list(coefficients)
        out.append(item)
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
    """Replace the envelope with `points`: raw values, each ramping to the next
    unless the next has `jump`, which holds until its time and then jumps. A
    point may carry `coefficients`: the curve of the segment it starts."""
    song = bridge.song
    track = regular_track(song, params.get("track"))
    param = _parameter(track, params)
    clip = clip_in_track(track, params)
    if not param.is_enabled:
        raise RouteError(409, "parameter is disabled or controlled by a macro")

    points = _points(params, param)
    # Read before the write: re_enable_automation takes effect after it returns,
    # so a read afterwards still says overridden. A Session clip's override ends
    # when the clip stops, so an overridden parameter would ignore this write.
    overridden = int(param.automation_state) == OVERRIDDEN

    env = _replace_envelope(clip, param, points)

    # Just after each time, so a jump reads its new value.
    result = {
        "parameter": _describe(param),
        "samples": [
            {"time": t, "value": env.value_at_time(t + EPSILON)} for t, _, _, _ in points
        ],
    }
    if overridden:
        result["re_enabled"] = True
    return result


def _replace_envelope(clip, param, points):
    """Clear the parameter's envelope and write `points`; returns the new one.

    A failure after the clear leaves nothing half written: the new envelope is
    removed and the error says so.
    """
    if clip.automation_envelope(param) is not None:
        clip.clear_envelope(param)
    try:
        env = clip.create_automation_envelope(param)
        _write_events(env, points)
        # Safe in any state, so always called.
        param.re_enable_automation()
    except Exception as err:
        try:
            clip.clear_envelope(param)
            outcome = "the envelope was removed"
        except Exception:
            outcome = "the envelope may be partly written"
        raise RouteError(
            500, "writing the envelope failed (%s: %s); %s" % (type(err).__name__, err, outcome)
        )
    return env


def _write_events(env, points):
    """Create every event, the last time first.

    Live straightens a curve on an event with no later event yet, so a curve
    only sticks once the segment's end exists. An event added at a time that
    already has events goes after them, so each time's events stay in order.
    """
    from Live.Envelope import EnvelopeEvent, EnvelopeEventControlCoefficients

    for group in reversed(_events_by_time(points)):
        for t, v, coefficients in group:
            if coefficients is None:
                env.create_event(EnvelopeEvent(t, v))
            else:
                env.create_event(
                    EnvelopeEvent(t, v, EnvelopeEventControlCoefficients(*coefficients))
                )


def _events_by_time(points):
    """Points as events, grouped by time: a jump is two events at one time.

    An event that repeats the one before it (same time and value) is dropped,
    as Live would, but keeps its coefficients: they shape the segment after.
    """
    groups = []
    prev = None
    for t, v, jump, coefficients in points:
        events = [(t, v, coefficients)]
        if jump and prev is not None:
            events.insert(0, (t, prev, None))
        for event in events:
            last = groups[-1][-1] if groups else None
            if last is not None and last[:2] == event[:2]:
                if event[2] is not None:
                    groups[-1][-1] = event
            elif groups and groups[-1][0][0] == t:
                groups[-1].append(event)
            else:
                groups.append([event])
        prev = v
    return groups


def clear(bridge, params):
    """Remove one envelope, or every envelope when no parameter is given.

    Clearing all reports whether any automation we can see was removed
    (`cleared`) and whether envelopes are still on the clip (`remaining`):
    modulation, clip-level and MIDI CC envelopes survive it.
    """
    track = regular_track(bridge.song, params.get("track"))
    clip = clip_in_track(track, params)
    if "parameter" not in params and "device" not in params:
        removed = any(True for _ in _automated(track, clip))
        clip.clear_all_envelopes()
        return {"cleared": removed, "all": True, "remaining": bool(clip.has_envelopes)}
    param = _parameter(track, params)
    had = clip.automation_envelope(param) is not None
    if had:
        clip.clear_envelope(param)
    return {"cleared": had}


# --- resolving ---------------------------------------------------------


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
            i = whole_number(name, "parameter")
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


def _automated(track, clip):
    """(target, parameter, envelope) for each automatable parameter that has one."""
    if not clip.has_envelopes:
        return
    for target, param in _automatable(track):
        env = clip.automation_envelope(param)
        if env is not None:
            yield target, param, env


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


def _coefficients(event):
    """An event's curve as (x1, y1, x2, y2)."""
    c = event.control_coefficients
    return (c.x1, c.y1, c.x2, c.y2)


def _num(v):
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
        raise RouteError(400, "expected a finite number, got %r" % (v,))
    return float(v)


def _curve(raw):
    """A point's optional curve: four numbers, each 0..1."""
    if raw is None:
        return None
    if not isinstance(raw, list) or len(raw) != 4:
        raise RouteError(400, "coefficients must be a list of 4 numbers")
    values = tuple(_num(v) for v in raw)
    if not all(0 <= v <= 1 for v in values):
        raise RouteError(400, "coefficients must each be from 0 to 1")
    return values


def _points(params, param):
    raw = params.get("points")
    if not isinstance(raw, list) or not 1 <= len(raw) <= MAX_EVENTS:
        raise RouteError(400, "give 1 to %d points" % MAX_EVENTS)
    if not all(isinstance(p, dict) for p in raw):
        raise RouteError(400, "each point must be an object with time and value")
    points = [
        (
            _num(p.get("time")),
            _num(p.get("value")),
            bool(p.get("jump", False)),
            _curve(p.get("coefficients")),
        )
        for p in raw
    ]
    if points[0][0] < 0 or any(b[0] < a[0] for a, b in zip(points, points[1:])):
        raise RouteError(400, "times must be >= 0 and non-decreasing")
    for _, v, _, _ in points:
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
