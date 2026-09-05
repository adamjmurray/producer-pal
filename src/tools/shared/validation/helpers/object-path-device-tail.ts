// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The device-chain half of the path grammar: everything after a track root
// that isn't one of the track's own children. See dev/Object-Paths.md.

import { noteNameToMidi } from "#src/shared/pitch.ts";
import { type DeviceSegment } from "../object-path.ts";
import { pathError } from "./object-path-lexer.ts";

const DEVICE = /^d(\d+)$/;
const CHAIN = /^c(\d+)$/;
const RETURN_CHAIN = /^rc(\d+)$/;
const DRUM_PAD = /^p(.+)$/;
/** The drum rack pad that catches every note no other pad claims. */
const CATCH_ALL_PAD = "*";

/** One step down a device chain: the track root, or a segment under it. */
type DeviceTailStep = DeviceSegment["kind"] | "root";

const DEVICE_KIND = "device";
const A_DEVICE = `"d<index>"`;

// How to name each step, and what may follow it. Without these rules a path
// like "t0/c0" or "t0/d0/d1" parses and then fails as a missing object, which
// reads as "your rack is wrong" rather than "your path is".
const DEVICE_TAIL_RULES: Record<
  DeviceTailStep,
  { noun: string; expected: string }
> = {
  root: { noun: "a track", expected: A_DEVICE },
  device: {
    noun: "a device",
    expected: `"c<index>", "rc<index>", or "p<note>"`,
  },
  chain: { noun: "a chain", expected: A_DEVICE },
  "return-chain": { noun: "a return chain", expected: A_DEVICE },
  "drum-pad": { noun: "a drum pad", expected: `"c<index>" or ${A_DEVICE}` },
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

  if (device) return { kind: "device", index: Number(device[1]) };

  const returnChain = RETURN_CHAIN.exec(segment);

  if (returnChain) {
    return { kind: "return-chain", index: Number(returnChain[1]) };
  }

  const chain = CHAIN.exec(segment);

  if (chain) return { kind: "chain", index: Number(chain[1]) };

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

/**
 * Parses the device chain after the root, checking each segment can follow the
 * one before it.
 * @param tail - Segments after the root
 * @param label - Param name for error messages
 * @param input - Full path, for error messages
 * @returns The parsed device-chain segments
 */
export function parseDeviceTail(
  tail: string[],
  label: string,
  input: string,
): DeviceSegment[] {
  let previous: DeviceTailStep = "root";

  return tail.map((raw) => {
    const segment = parseDeviceSegment(raw, label, input);

    if (!canFollow(segment.kind, previous)) {
      const { noun, expected } = DEVICE_TAIL_RULES[previous];

      throw pathError(
        label,
        input,
        `"${raw}" can't follow ${noun}; expected ${expected}`,
      );
    }

    previous = segment.kind;

    return segment;
  });
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
  if (kind === DEVICE_KIND) return previous !== DEVICE_KIND;

  return (
    previous === DEVICE_KIND || (kind === "chain" && previous === "drum-pad")
  );
}
