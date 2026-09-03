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

import {
  parseLegacyPath,
  pathError,
  splitCoord,
} from "./helpers/object-path-lexer.ts";
import { parseDeviceTail } from "./helpers/object-path-device-tail.ts";
import {
  arrangementPosition,
  type ArrangementPosition,
} from "./helpers/object-path-coord.ts";

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

/** A path naming a place to create something rather than a thing that exists. */
export type NewObjectSegment =
  | { kind: "new-track" }
  | { kind: "new-return-track" }
  | { kind: "new-scene" };

/** Everything a path can name. */
export type ObjectPath =
  | TrackSegment
  | NewObjectSegment
  | { kind: "scene"; sceneIndex: number }
  | { kind: "slot"; trackIndex: number; sceneIndex: number }
  | { kind: "take-lane"; trackIndex: number; laneIndex: number }
  | { kind: "new-take-lane"; trackIndex: number }
  | { kind: "device"; root: TrackSegment; segments: DeviceSegment[] }
  | ArrangementPosition;

const TRACK_ROOT = /^t(\d+)$/;
const RETURN_TRACK_ROOT = /^rt(\d+)$/;
const SCENE = /^s(\d+)$/;
const TAKE_LANE = /^l(\d+)$/;
const NEW_TAKE_LANE = "l+";
const NEW_TRACK = "t+";
const NEW_RETURN_TRACK = "rt+";
const NEW_SCENE = "s+";

// What results said before 2.2.0: a bare track index, or trackIndex/sceneIndex.
// Honored with a warning rather than refused — a model pasting back what a
// result told it made a well-founded guess, not a typo.
// A Map, not an object: a plain object answers "constructor" and "toString"
// from its prototype, and returning one of those as a parsed root loses the
// caller's input from every error message downstream.
/** The "+" roots, keyed by their spelling. */
const NEW_OBJECT_ROOTS = new Map<string, NewObjectSegment>([
  [NEW_TRACK, { kind: "new-track" }],
  [NEW_RETURN_TRACK, { kind: "new-return-track" }],
  [NEW_SCENE, { kind: "new-scene" }],
]);

/** What each "+" root names, for messages. */
export const NEW_OBJECT_NOUNS: Record<NewObjectSegment["kind"], string> = {
  "new-track": "a new track",
  "new-return-track": "a new return track",
  "new-scene": "a new scene",
};

const LIVE_API_COLLECTION = {
  device: "devices",
  chain: "chains",
  "return-chain": "return_chains",
} as const;

/**
 * Parses a path into what it names. Does not check that the object exists —
 * callers resolve the result against the Live API.
 * @param path - The path (e.g., "t0", "t0/s3", "t0/l0", "t1/d0")
 * @param label - Param name for error messages
 * @returns What the path names
 */
export function parseObjectPath(path: string, label = "path"): ObjectPath {
  if (typeof path !== "string" || path.trim() === "") {
    throw new Error(`invalid ${label}: path is empty`);
  }

  const input = path.trim();
  const { body, position } = splitCoord(input, label);

  // The lane is parsed by this same grammar, then narrowed to the few shapes a
  // song position can sit on.
  if (position != null) {
    return arrangementPosition(
      body === "" ? null : parseObjectPath(body, label),
      position,
      label,
      input,
    );
  }

  const legacy = parseLegacyPath(input, label);

  if (legacy != null) return legacy;

  // The body carries no brackets, so a plain split is already depth-0.
  const segments = body.split("/");

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
    case "new-track":
      return NEW_TRACK;
    case "new-return-track":
      return NEW_RETURN_TRACK;
    case "new-scene":
      return NEW_SCENE;
    case "device":
      return [
        formatTrackSegment(path.root),
        ...path.segments.map(formatDeviceSegment),
      ].join("/");
    case "arrangement-position":
      return `${path.lane == null ? "" : formatObjectPath(path.lane)}[${path.position}]`;
    default:
      return formatTrackSegment(path);
  }
}

/**
 * Whether a path names something to create rather than something that exists.
 * @param path - A parsed path
 * @returns True for "t+", "rt+" and "s+"
 */
export function isNewObjectPath(path: ObjectPath): path is NewObjectSegment {
  return Object.hasOwn(NEW_OBJECT_NOUNS, path.kind);
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

// --- Helpers below main exports ---

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
): Extract<ObjectPath, TrackSegment | NewObjectSegment | { kind: "scene" }> {
  if (segment === "mt") return { kind: "master-track" };

  const created = NEW_OBJECT_ROOTS.get(segment);

  if (created != null) return created;

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
  if (isNewObjectPath(root)) {
    throw pathError(
      label,
      input,
      `${NEW_OBJECT_NOUNS[root.kind]} has no parts yet`,
    );
  }

  if (root.kind === "scene") {
    throw pathError(
      label,
      input,
      `a scene has no parts; a clip slot is "t<track>/s<scene>"`,
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
 * Builds the clip slot or take lane a track child names.
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
        `a clip slot is "t<track>/s<scene>" (e.g. "t0/s1"); only regular tracks have scenes`,
      )
    : pathError(
        label,
        input,
        `a take lane is "t<track>/l<lane>" (e.g. "t0/l0") or "t<track>/l+"; only regular tracks have take lanes`,
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
