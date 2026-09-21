// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Clip automation envelopes, which the Live API can't reach at all: only the
// Producer Pal remote script can, over a round trip per envelope.

import { formatEnvelopeNotation } from "#src/notation/barbeat/envelope/envelope-notation.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  ARRANGEMENT_CLIP_NOTE,
  envelopeRoute,
} from "#src/tools/clip/envelopes/envelope-route.ts";
import {
  ENVELOPE_ROUTES,
  type EnvelopeListResult,
  type EnvelopeReadResult,
} from "#src/tools/clip/envelopes/remote-script-envelope-contract.ts";

/** How many events of one envelope a read returns before it says `truncated`. */
const MAX_ENVELOPE_EVENTS = 32;

/** A device segment of the remote script's device path: d0, or c1 for a chain. */
const DEVICE_SEGMENT = /^([dc])(\d+)$/;

/** A mixer send, as the remote script names it: send0, send1, ... */
const SEND_PARAMETER = /^send(\d+)$/;

/** One automated parameter on a clip. */
export interface ClipEnvelope {
  /** The parameter's name, as Live shows it */
  parameter: string;
  /** The Live parameter object's id */
  id?: string;
  /** The device the parameter belongs to, "t3/d0"; absent for a mixer param */
  device?: string;
  eventCount: number;
  /** Set when the clip holds more events than the read returned */
  truncated?: true;
  /** The automation as envelope notation, in the clip's own meter */
  events: string;
}

type ListedEnvelope = EnvelopeListResult["envelopes"][number];

/**
 * Read every automated parameter on a clip through the remote script.
 * @param clip - LiveAPI clip object
 * @param isArrangementClip - Whether the clip is in the arrangement
 * @param clipMeter - Getter for the clip's meter, which spells the event times
 * @returns One entry per automated parameter, or why there are none to report
 */
export async function clipEnvelopes(
  clip: LiveAPI,
  isArrangementClip: boolean,
  clipMeter: () => { numerator: number; denominator: number },
): Promise<ClipEnvelope[] | string> {
  if (isArrangementClip) {
    return ARRANGEMENT_CLIP_NOTE;
  }

  const trackIndex = clip.trackIndex;
  const slot = clip.sceneIndex;

  if (trackIndex == null || slot == null) {
    return "only a clip in a session clip slot can report its automation";
  }

  const target = { track: `t${String(trackIndex)}`, slot };
  const listed = await envelopeRoute<EnvelopeListResult>(
    ENVELOPE_ROUTES.list,
    target,
  );

  if (!listed.ok) {
    return listed.reason;
  }

  const envelopes: ClipEnvelope[] = [];

  for (const entry of listed.result.envelopes) {
    const read = await envelopeRoute<EnvelopeReadResult>(ENVELOPE_ROUTES.read, {
      ...target,
      ...parameterTarget(entry),
      limit: MAX_ENVELOPE_EVENTS,
    });

    if (!read.ok) {
      return read.reason;
    }

    envelopes.push(envelopeEntry(trackIndex, entry, read.result, clipMeter));
  }

  return envelopes;
}

// --- Helpers below main exports ---

/**
 * Name one listed envelope's parameter the way a read route takes it.
 * @param entry - One envelope from the list route
 * @returns The device and parameter args for the read
 */
function parameterTarget(entry: ListedEnvelope): {
  device?: string;
  parameter?: string | number;
} {
  return entry.device == null
    ? { parameter: entry.parameter_name }
    : { device: entry.device, parameter: entry.parameter_index };
}

/**
 * Build one envelope's result entry.
 * @param trackIndex - The clip's track, which spells the device path
 * @param entry - What the list route said about the parameter
 * @param read - What the read route returned for it
 * @param clipMeter - Getter for the clip's meter
 * @returns The entry for the clip result
 */
function envelopeEntry(
  trackIndex: number,
  entry: ListedEnvelope,
  read: EnvelopeReadResult,
  clipMeter: () => { numerator: number; denominator: number },
): ClipEnvelope {
  const { numerator, denominator } = clipMeter();
  const id = parameterId(trackIndex, entry);

  return {
    parameter: entry.parameter.name,
    ...(id != null && { id }),
    ...(entry.device != null && {
      device: `t${String(trackIndex)}/${entry.device}`,
    }),
    eventCount: read.event_count ?? entry.event_count,
    ...(read.truncated === true && { truncated: true as const }),
    events: formatEnvelopeNotation(
      (read.events ?? []).map((event) => ({
        time: event.time,
        value: event.value,
        display: event.display_str,
      })),
      { timeSigNumerator: numerator, timeSigDenominator: denominator },
    ),
  };
}

/**
 * The id of the Live parameter an envelope automates, so a caller can address
 * it the way every other tool result does.
 * @param trackIndex - The clip's track
 * @param entry - One envelope from the list route
 * @returns The parameter's id, or null when nothing is at that address
 */
function parameterId(trackIndex: number, entry: ListedEnvelope): string | null {
  const track = LiveAPI.from(livePath.track(trackIndex));
  const parameter =
    entry.device == null
      ? mixerParameter(track, entry.parameter_name)
      : deviceParameter(track, entry.device, entry.parameter_index ?? 0);

  return parameter != null && parameter.exists() ? parameter.id : null;
}

/**
 * Walk d0, d0/c1/d0 to a device, then to one of its parameters.
 * @param track - The clip's track
 * @param device - The remote script's device path
 * @param index - The parameter's index on that device
 * @returns The parameter, or null when the path isn't one we can walk
 */
function deviceParameter(
  track: LiveAPI,
  device: string,
  index: number,
): LiveAPI | null {
  let container = track;

  for (const segment of device.split("/")) {
    const match = DEVICE_SEGMENT.exec(segment);

    if (match == null) {
      return null;
    }

    container = container.child(
      match[1] === "d" ? "devices" : "chains",
      match[2] as string,
    );
  }

  return container.child("parameters", String(index));
}

/**
 * The track mixer's volume, pan or send, as the remote script names it.
 * @param track - The clip's track
 * @param name - volume, pan, or send0..
 * @returns The parameter, or null when the name isn't one of those
 */
function mixerParameter(track: LiveAPI, name?: string): LiveAPI | null {
  const mixer = track.child("mixer_device");

  if (name === "volume") {
    return mixer.child("volume");
  }

  if (name === "pan") {
    return mixer.child("panning");
  }

  const send = SEND_PARAMETER.exec(name ?? "");

  return send == null ? null : mixer.child("sends", send[1] as string);
}
