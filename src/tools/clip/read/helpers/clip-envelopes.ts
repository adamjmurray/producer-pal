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

/** What a clip's envelopes say when it holds ones Producer Pal can't see. */
const UNREADABLE_ENVELOPES =
  "the clip has envelopes Producer Pal can't read (modulation, clip-level ones like Gain, or MIDI CC)";

/** The note on every envelope of an unwarped audio clip. */
const UNWARPED_ENVELOPE_NOTE =
  "doesn't play: the clip is unwarped. Turn warping on to hear it";

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
  /** The automation as envelope notation, in the clip's own meter; absent when it couldn't be read */
  events?: string;
  /** Why `events` is absent, or why the envelope doesn't play */
  detail?: string;
}

type ListedEnvelope = EnvelopeListResult["envelopes"][number];

/**
 * Read every automated parameter on a clip through the remote script.
 * @param clip - LiveAPI clip object
 * @param isArrangementClip - Whether the clip is in the arrangement
 * @param clipMeter - Getter for the clip's meter, which spells the event times
 * @param deadline - The request deadline from ToolContext, if any
 * @returns One entry per automated parameter, each saying why when its events
 *   couldn't be read or can't play, or why there are none to report at all
 */
export async function clipEnvelopes(
  clip: LiveAPI,
  isArrangementClip: boolean,
  clipMeter: () => { numerator: number; denominator: number },
  deadline?: number | null,
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
    deadline,
  );

  if (!listed.ok) {
    return listed.reason;
  }

  // `has_envelopes` is true for any envelope; the routes only see automation.
  if (
    listed.result.envelopes.length === 0 &&
    (clip.getProperty("has_envelopes") as number) > 0
  ) {
    return UNREADABLE_ENVELOPES;
  }

  const unwarped =
    (clip.getProperty("is_audio_clip") as number) > 0 &&
    (clip.getProperty("warping") as number) === 0;
  const envelopes: ClipEnvelope[] = [];

  let stalledReason: string | undefined;

  for (const entry of listed.result.envelopes) {
    if (stalledReason != null) {
      envelopes.push(
        unreadEnvelope(trackIndex, entry, `not read: ${stalledReason}`),
      );

      continue;
    }

    const read = await envelopeRoute<EnvelopeReadResult>(
      ENVELOPE_ROUTES.read,
      {
        ...target,
        ...parameterTarget(entry),
        limit: MAX_ENVELOPE_EVENTS,
      },
      deadline,
    );

    if (!read.ok) {
      if (!read.available) {
        return read.reason;
      }

      // A stalled route would stall the rest the same way.
      if (read.stalled != null) {
        stalledReason = read.reason;
      }

      envelopes.push(unreadEnvelope(trackIndex, entry, read.reason));

      continue;
    }

    envelopes.push(
      envelopeEntry(trackIndex, entry, read.result, clipMeter, unwarped),
    );
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
 * Name one listed envelope's parameter on a result entry.
 * @param trackIndex - The clip's track, which spells the device path
 * @param entry - What the list route said about the parameter
 * @returns The parameter, id and device the entry names it by
 */
function envelopeIdentity(
  trackIndex: number,
  entry: ListedEnvelope,
): Pick<ClipEnvelope, "parameter" | "id" | "device"> {
  const id = parameterId(trackIndex, entry);

  return {
    parameter: entry.parameter.name,
    ...(id != null && { id }),
    ...(entry.device != null && {
      device: `t${String(trackIndex)}/${entry.device}`,
    }),
  };
}

/**
 * Build the entry for a parameter whose events weren't read.
 * @param trackIndex - The clip's track
 * @param entry - What the list route said about the parameter
 * @param detail - Why its events are missing
 * @returns The entry, with the event count the list gave
 */
function unreadEnvelope(
  trackIndex: number,
  entry: ListedEnvelope,
  detail: string,
): ClipEnvelope {
  return {
    ...envelopeIdentity(trackIndex, entry),
    eventCount: entry.event_count,
    detail,
  };
}

/**
 * Build one envelope's result entry.
 * @param trackIndex - The clip's track, which spells the device path
 * @param entry - What the list route said about the parameter
 * @param read - What the read route returned for it
 * @param clipMeter - Getter for the clip's meter
 * @param unwarped - Whether the clip is audio with warping off
 * @returns The entry for the clip result
 */
function envelopeEntry(
  trackIndex: number,
  entry: ListedEnvelope,
  read: EnvelopeReadResult,
  clipMeter: () => { numerator: number; denominator: number },
  unwarped: boolean,
): ClipEnvelope {
  const { numerator, denominator } = clipMeter();

  return {
    ...envelopeIdentity(trackIndex, entry),
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
    ...(unwarped && { detail: UNWARPED_ENVELOPE_NOTE }),
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
