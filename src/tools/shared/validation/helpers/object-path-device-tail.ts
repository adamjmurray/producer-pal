// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The device-chain half of the path grammar: everything after a track root
// that isn't one of the track's own children. See dev/tools/object-paths/README.md.

import { noteNameToMidi } from "#src/shared/pitch.ts";
import { type DeviceSegment, type DeviceTypeName } from "../object-path.ts";
import { NEW_CHAIN, NEW_DEVICE, pathError } from "./object-path-lexer.ts";

const DEVICE = /^d(\d+)$/;
const CHAIN = /^c(\d+)$/;
const RETURN_CHAIN = /^rc(\d+)$/;
const DRUM_PAD = /^p(.+)$/;
/** The drum rack pad that catches every note no other pad claims. */
const CATCH_ALL_PAD = "*";

/** How one device type is spelled in a path, and what to call it in prose. */
export interface DeviceTypeForm {
  /** The canonical segment spelling, e.g. "afx". */
  segment: string;
  /** The long spelling, also parsed but never rendered. */
  long: string;
  noun: string;
  plural: string;
  /** Whether the segment carries an index; an instrument doesn't. */
  indexed: boolean;
}

/**
 * How each device type is spelled and named, plus the long form also accepted.
 * Long forms parse but are never rendered and never documented outside
 * dev/tools/object-paths/README.md. An instrument takes no index: a container holds one.
 */
export const DEVICE_TYPE_FORMS: Record<DeviceTypeName, DeviceTypeForm> = {
  instrument: {
    segment: "inst",
    long: "instrument",
    noun: "instrument",
    plural: "instruments",
    indexed: false,
  },
  "midi-effect": {
    segment: "mfx",
    long: "midifx",
    noun: "MIDI effect",
    plural: "MIDI effects",
    indexed: true,
  },
  "audio-effect": {
    segment: "afx",
    long: "audiofx",
    noun: "audio effect",
    plural: "audio effects",
    indexed: true,
  },
};

/** Each device type's segment pattern, with the long form, built once. */
const DEVICE_TYPE_PATTERNS = Object.entries(DEVICE_TYPE_FORMS).map(
  ([deviceType, form]) => ({
    deviceType: deviceType as DeviceTypeName,
    form,
    pattern: new RegExp(`^(?:${form.segment}|${form.long})(\\d*)$`),
  }),
);

/** One step down a device chain: the track root, or a segment under it. */
type DeviceTailStep = DeviceSegment["kind"] | "root";

const DEVICE_KIND = "device";
const DEVICE_BY_TYPE_KIND = "device-by-type";
const A_DEVICE = `"d<index>", "d+", "inst", "mfx<index>", or "afx<index>"`;
const A_PAD_CHILD = `"c<index>", ${A_DEVICE}`;

// How to name each step, and what may follow it. Without these rules a path
// like "t0/c0" or "t0/d0/d1" parses and then fails as a missing object, which
// reads as "your rack is wrong" rather than "your path is".
const AFTER_A_DEVICE = {
  noun: "a device",
  expected: `"c<index>", "rc<index>", or "p<note>"`,
};

const DEVICE_TAIL_RULES: Record<
  DeviceTailStep,
  { noun: string; expected: string }
> = {
  root: { noun: "a track", expected: A_DEVICE },
  device: AFTER_A_DEVICE,
  "device-by-type": AFTER_A_DEVICE,
  chain: { noun: "a chain", expected: A_DEVICE },
  "return-chain": { noun: "a return chain", expected: A_DEVICE },
  "drum-pad": { noun: "a drum pad", expected: A_PAD_CHILD },
};

/**
 * Parses one device-chain segment.
 * @param segment - The segment
 * @param label - Param name for error messages
 * @param input - Full path, for error messages
 * @returns What the segment names
 */
function parseDeviceSegment(
  segment: string,
  label: string,
  input: string,
): DeviceSegment {
  const device = DEVICE.exec(segment);

  if (device) {
    return { kind: "device", index: Number(device[1]) };
  }

  const returnChain = RETURN_CHAIN.exec(segment);

  if (returnChain) {
    return { kind: "return-chain", index: Number(returnChain[1]) };
  }

  const chain = CHAIN.exec(segment);

  if (chain) {
    return { kind: "chain", index: Number(chain[1]) };
  }

  const byType = parseDeviceTypeSegment(segment, label, input);

  if (byType) {
    return byType;
  }

  const drumPad = DRUM_PAD.exec(segment);

  if (drumPad) {
    const note = drumPad[1] as string;

    // Live keys drum pads by note, so an unparseable one names no pad. Caught
    // here because the read path and the write path fail differently otherwise
    // — one throws, one warn-skips with a message about the rack.
    if (note !== CATCH_ALL_PAD && noteNameToMidi(note) == null) {
      throw pathError(
        label,
        input,
        `"${segment}" names no drum pad; use a note name (e.g. "pC1"), or "p*" for the catch-all pad`,
      );
    }

    return { kind: "drum-pad", note };
  }

  throw pathError(
    label,
    input,
    `"${segment}" is not a device, chain, or drum pad; expected "d<index>", ` +
      `"c<index>", "rc<index>", or "p<note>"`,
  );
}

/** A parsed device chain, and whether a `c+` or `d+` appends one past it. */
export interface DeviceTail {
  segments: DeviceSegment[];
  appendsChain: boolean;
  appendsDevice: boolean;
}

/**
 * Parses the device chain after the root, checking each segment can follow the
 * one before it. A trailing `c+` or `d+` appends to whatever the segments name,
 * so it goes on the tail rather than into it. Each must be last, so a path can
 * only ever carry one of them.
 * @param tail - Segments after the root
 * @param label - Param name for error messages
 * @param input - Full path, for error messages
 * @returns The parsed segments, and which append marker closes them
 */
export function parseDeviceTail(
  tail: string[],
  label: string,
  input: string,
): DeviceTail {
  const segments: DeviceSegment[] = [];
  let previous: DeviceTailStep = "root";
  let appendsChain = false;
  let appendsDevice = false;

  for (const [index, raw] of tail.entries()) {
    const last = index === tail.length - 1;

    if (raw === NEW_CHAIN) {
      requireLast(last, NEW_CHAIN, "a new, empty chain", label, input);
      // Goes exactly where a "c<index>" could: a rack's chain, or a pad's layer.
      requireStep("chain", previous, raw, label, input);
      appendsChain = true;
      continue;
    }

    if (raw === NEW_DEVICE) {
      requireLast(last, NEW_DEVICE, "a new device", label, input);
      // Goes exactly where a "d<index>" could.
      requireStep(DEVICE_KIND, previous, raw, label, input);
      appendsDevice = true;
      continue;
    }

    const segment = parseDeviceSegment(raw, label, input);

    requireStep(segment.kind, previous, raw, label, input);
    previous = segment.kind;
    segments.push(segment);
  }

  return { segments, appendsChain, appendsDevice };
}

/**
 * Checks an append marker closes the path, since what it makes is empty and
 * nothing can be addressed inside it.
 * @param last - Whether the marker is the final segment
 * @param marker - The marker as written
 * @param noun - What it appends, for the error
 * @param label - Param name for error messages
 * @param input - Full path, for error messages
 * @throws Error when something follows the marker
 */
function requireLast(
  last: boolean,
  marker: string,
  noun: string,
  label: string,
  input: string,
): void {
  if (!last) {
    throw pathError(
      label,
      input,
      `"${marker}" appends ${noun}, so nothing can follow it`,
    );
  }
}

/**
 * Checks a segment can sit under the step before it.
 * @param kind - The segment's kind
 * @param previous - The step it would sit under
 * @param raw - The segment as written, for the error
 * @param label - Param name for error messages
 * @param input - Full path, for error messages
 * @throws Error when that is nesting Live doesn't have
 */
function requireStep(
  kind: DeviceSegment["kind"],
  previous: DeviceTailStep,
  raw: string,
  label: string,
  input: string,
): void {
  if (canFollow(kind, previous)) {
    return;
  }

  const { noun, expected } = DEVICE_TAIL_RULES[previous];

  throw pathError(
    label,
    input,
    `"${raw}" can't follow ${noun}; expected ${expected}`,
  );
}

/**
 * Whether a segment can sit under the step before it. A track holds devices, a
 * device holds chains, return chains, and drum pads, and each of those holds
 * devices — so the tail alternates, except that a drum pad also takes a `c<n>`
 * picking among the chains that share its note.
 * @param kind - The segment's kind
 * @param previous - The step it would sit under
 * @returns True when that is nesting Live has
 */
function canFollow(
  kind: DeviceSegment["kind"],
  previous: DeviceTailStep,
): boolean {
  if (isDeviceStep(kind)) {
    return !isDeviceStep(previous);
  }

  return (
    isDeviceStep(previous) || (kind === "chain" && previous === "drum-pad")
  );
}

/**
 * Whether a step is a device, however it was addressed — by index or by type.
 * @param step - A segment kind, or the root
 * @returns True for both device spellings
 */
function isDeviceStep(step: DeviceTailStep): boolean {
  return step === DEVICE_KIND || step === DEVICE_BY_TYPE_KIND;
}

/**
 * Parses a segment that names a device by its type rather than its position.
 * @param segment - The segment
 * @param label - Param name for error messages
 * @param input - Full path, for error messages
 * @returns The segment, or null when it names no device type
 */
function parseDeviceTypeSegment(
  segment: string,
  label: string,
  input: string,
): DeviceSegment | null {
  for (const { deviceType, form, pattern } of DEVICE_TYPE_PATTERNS) {
    const match = pattern.exec(segment);

    if (!match) {
      continue;
    }

    const digits = match[1] as string;

    if (form.indexed && digits === "") {
      throw pathError(
        label,
        input,
        `"${segment}" needs an index; the first ${form.noun} is "${form.segment}0"`,
      );
    }

    if (!form.indexed && digits !== "") {
      throw pathError(
        label,
        input,
        `"${segment}" takes no index; a container holds one ${form.noun}, so it is just "${form.segment}"`,
      );
    }

    return {
      kind: "device-by-type",
      deviceType: deviceType,
      index: digits === "" ? 0 : Number(digits),
    };
  }

  return null;
}
