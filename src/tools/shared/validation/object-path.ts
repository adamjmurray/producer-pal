// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The one path grammar. Every param that names a location in the Live Set —
// where a clip or device is, where one goes — parses here, so a path means the
// same thing on every tool. A segment's index is always the Live API index;
// `p<note>` is the only exception, because Live indexes drum pads by MIDI note.
//
// Parsing only: nothing here touches the Live API, so a bad path fails before
// anything is created or moved. See dev/Object-Paths.md.

import * as console from "#src/shared/max/v8-max-console.ts";
import { noteNameToMidi } from "#src/shared/pitch.ts";

/** A path root naming a track. */
export type TrackSegment =
  | { kind: "track"; trackIndex: number }
  | { kind: "return-track"; returnIndex: number }
  | { kind: "master-track" };

/** A segment below a track root, down the device chain. */
export type DeviceSegment =
  | { kind: "device"; index: number }
  | { kind: "chain"; index: number }
  | { kind: "return-chain"; index: number }
  | { kind: "drum-pad"; note: string };

/** A device-chain segment that indexes into a Live API collection. */
export type IndexedSegment = Exclude<DeviceSegment, { kind: "drum-pad" }>;

/** Everything a path can name. */
export type ObjectPath =
  | TrackSegment
  | { kind: "scene"; sceneIndex: number }
  | { kind: "slot"; trackIndex: number; sceneIndex: number }
  | { kind: "take-lane"; trackIndex: number; laneIndex: number }
  | { kind: "new-take-lane"; trackIndex: number }
  | { kind: "device"; root: TrackSegment; segments: DeviceSegment[] };

const TRACK_ROOT = /^t(\d+)$/;
const RETURN_TRACK_ROOT = /^rt(\d+)$/;
const SCENE = /^s(\d+)$/;
const TAKE_LANE = /^l(\d+)$/;
const NEW_TAKE_LANE = "l+";
const DEVICE = /^d(\d+)$/;
const CHAIN = /^c(\d+)$/;
const RETURN_CHAIN = /^rc(\d+)$/;
const DRUM_PAD = /^p(.+)$/;
/** The drum rack pad that catches every note no other pad claims. */
const CATCH_ALL_PAD = "*";

// What results said before 2.2.0: a bare track index, or trackIndex/sceneIndex.
// Honored with a warning rather than refused — a model pasting back what a
// result told it made a well-founded guess, not a typo.
const LEGACY_TRACK = /^(\d+)$/;
const LEGACY_SLOT = /^(\d+)\/(\d+)$/;

const LIVE_API_COLLECTION = {
  device: "devices",
  chain: "chains",
  "return-chain": "return_chains",
} as const;

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
 * Parses a path into what it names. Does not check that the object exists —
 * callers resolve the result against the Live API.
 * @param path - The path (e.g., "t0", "t0/s3", "t0/l1", "t1/d0")
 * @param label - Param name for error messages
 * @returns What the path names
 */
export function parseObjectPath(path: string, label = "path"): ObjectPath {
  if (typeof path !== "string" || path.trim() === "") {
    throw new Error(`invalid ${label}: path is empty`);
  }

  const input = path.trim();
  const legacy = parseLegacyPath(input, label);

  if (legacy != null) return legacy;

  const segments = input.split("/");

  // "t1/" is a typo, not a path with a nameless segment — without this it falls
  // through to the device branch and complains about device segments.
  if (segments.includes("")) {
    throw pathError(
      label,
      input,
      'it has an empty segment; drop the stray "/"',
    );
  }

  const root = parseRoot(segments[0] as string, label, input);
  const tail = segments.slice(1);

  return tail.length === 0 ? root : parseTail(root, tail, label, input);
}

/**
 * Renders a parsed path back to its canonical spelling. Round-trips every path
 * the grammar accepts, which is how a tolerated legacy value comes back out as
 * the spelling we want the caller using.
 * @param path - A parsed path
 * @returns The canonical path string
 */
export function formatObjectPath(path: ObjectPath): string {
  switch (path.kind) {
    case "scene":
      return `s${path.sceneIndex}`;
    case "slot":
      return `t${path.trackIndex}/s${path.sceneIndex}`;
    case "take-lane":
      return `t${path.trackIndex}/l${path.laneIndex}`;
    case "new-take-lane":
      return `t${path.trackIndex}/${NEW_TAKE_LANE}`;
    case "device":
      return [
        formatTrackSegment(path.root),
        ...path.segments.map(formatDeviceSegment),
      ].join("/");
    default:
      return formatTrackSegment(path);
  }
}

/**
 * Renders a device-chain segment back to its canonical spelling.
 * @param segment - A parsed device segment
 * @returns The canonical segment string
 */
export function formatDeviceSegment(segment: DeviceSegment): string {
  switch (segment.kind) {
    case "device":
      return `d${segment.index}`;
    case "chain":
      return `c${segment.index}`;
    case "return-chain":
      return `rc${segment.index}`;
    default:
      return `p${segment.note}`;
  }
}

/**
 * The Live API child collection a device-chain segment indexes into.
 * @param segment - A device, chain, or return-chain segment
 * @returns The Live API collection name
 */
export function liveApiCollection(segment: IndexedSegment): string {
  return LIVE_API_COLLECTION[segment.kind];
}

/**
 * Builds the error every path problem is reported as, so one voice covers the
 * whole grammar.
 * @param label - Param name the path came from
 * @param input - The path as the caller wrote it
 * @param problem - What's wrong, and how to fix it
 * @returns The error to throw
 */
export function pathError(
  label: string,
  input: string,
  problem: string,
): Error {
  return new Error(`invalid ${label} "${input}" - ${problem}`);
}

// --- Helpers below main exports ---

/**
 * Reads a pre-2.2.0 slot or bare track index, warning to teach the spelling
 * that replaced it.
 * @param input - The trimmed path
 * @param label - Param name for error messages
 * @returns What the legacy value names, or null when it isn't one
 */
function parseLegacyPath(input: string, label: string): ObjectPath | null {
  const slot = LEGACY_SLOT.exec(input);

  if (slot) {
    const trackIndex = Number(slot[1]);
    const sceneIndex = Number(slot[2]);

    console.warn(
      `${label} "${input}" is the old slot spelling; use "t${trackIndex}/s${sceneIndex}"`,
    );

    return { kind: "slot", trackIndex, sceneIndex };
  }

  const track = LEGACY_TRACK.exec(input);

  if (track) {
    const trackIndex = Number(track[1]);

    console.warn(
      `${label} "${input}" is a bare track index; use "t${trackIndex}"`,
    );

    return { kind: "track", trackIndex };
  }

  return null;
}

/**
 * Parses the leading segment, which names a track or a scene.
 * @param segment - The first path segment
 * @param label - Param name for error messages
 * @param input - Full path, for error messages
 * @returns What the root names
 */
function parseRoot(
  segment: string,
  label: string,
  input: string,
): Extract<ObjectPath, TrackSegment | { kind: "scene" }> {
  if (segment === "mt") return { kind: "master-track" };

  const returnTrack = RETURN_TRACK_ROOT.exec(segment);

  if (returnTrack) {
    return { kind: "return-track", returnIndex: Number(returnTrack[1]) };
  }

  const track = TRACK_ROOT.exec(segment);

  if (track) return { kind: "track", trackIndex: Number(track[1]) };

  const scene = SCENE.exec(segment);

  if (scene) return { kind: "scene", sceneIndex: Number(scene[1]) };

  throw pathError(
    label,
    input,
    `"${segment}" is not a track or scene; expected "t<index>", "rt<index>", "mt", or "s<index>"`,
  );
}

/**
 * Parses everything after the root: one track child (a scene or take lane), or
 * a device chain.
 * @param root - The parsed root segment
 * @param tail - Segments after the root
 * @param label - Param name for error messages
 * @param input - Full path, for error messages
 * @returns What the whole path names
 */
function parseTail(
  root: ReturnType<typeof parseRoot>,
  tail: string[],
  label: string,
  input: string,
): ObjectPath {
  if (root.kind === "scene") {
    throw pathError(
      label,
      input,
      `a scene has no parts; a session slot is "t<track>/s<scene>"`,
    );
  }

  const first = tail[0] as string;

  // A scene or take lane anywhere but right after the track is a misplaced
  // coordinate, not a device — say so instead of blaming a device segment.
  const misplaced = tail.findIndex(
    (segment, i) => i > 0 && isTrackChild(segment),
  );

  if (misplaced !== -1) {
    throw trackChildError(label, input, tail[misplaced] as string);
  }

  if (isTrackChild(first)) {
    return parseTrackChild(root, first, tail.length, label, input);
  }

  return {
    kind: "device",
    root,
    segments: parseDeviceTail(tail, label, input),
  };
}

/**
 * Parses the device chain after the root, checking each segment can follow the
 * one before it.
 * @param tail - Segments after the root
 * @param label - Param name for error messages
 * @param input - Full path, for error messages
 * @returns The parsed device-chain segments
 */
function parseDeviceTail(
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

/**
 * Whether a segment names one of a track's own children rather than a device.
 * @param segment - A path segment
 * @returns True for scene and take lane segments
 */
function isTrackChild(segment: string): boolean {
  return (
    SCENE.test(segment) || TAKE_LANE.test(segment) || segment === NEW_TAKE_LANE
  );
}

/**
 * Builds the session slot or take lane a track child names.
 * @param root - The parsed root segment
 * @param segment - The child segment
 * @param tailLength - How many segments follow the root
 * @param label - Param name for error messages
 * @param input - Full path, for error messages
 * @returns The slot or take lane
 */
function parseTrackChild(
  root: TrackSegment,
  segment: string,
  tailLength: number,
  label: string,
  input: string,
): ObjectPath {
  if (root.kind !== "track" || tailLength !== 1) {
    throw trackChildError(label, input, segment);
  }

  const scene = SCENE.exec(segment);

  if (scene) {
    return {
      kind: "slot",
      trackIndex: root.trackIndex,
      sceneIndex: Number(scene[1]),
    };
  }

  if (segment === NEW_TAKE_LANE) {
    return { kind: "new-take-lane", trackIndex: root.trackIndex };
  }

  const lane = TAKE_LANE.exec(segment) as RegExpExecArray;

  return {
    kind: "take-lane",
    trackIndex: root.trackIndex,
    laneIndex: Number(lane[1]),
  };
}

/**
 * Explains a scene or take lane that can't be where it is.
 * @param label - Param name for error messages
 * @param input - Full path, for error messages
 * @param segment - The offending segment
 * @returns The error to throw
 */
function trackChildError(label: string, input: string, segment: string): Error {
  return SCENE.test(segment)
    ? pathError(
        label,
        input,
        `a session slot is "t<track>/s<scene>" (e.g. "t0/s1"); only regular tracks have scenes`,
      )
    : pathError(
        label,
        input,
        `a take lane is "t<track>/l<lane>" (e.g. "t0/l1") or "t<track>/l+"; only regular tracks have take lanes`,
      );
}

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
 * Renders a track root back to its canonical spelling.
 * @param track - A parsed track root
 * @returns The canonical root string
 */
function formatTrackSegment(track: TrackSegment): string {
  switch (track.kind) {
    case "track":
      return `t${track.trackIndex}`;
    case "return-track":
      return `rt${track.returnIndex}`;
    default:
      return "mt";
  }
}
