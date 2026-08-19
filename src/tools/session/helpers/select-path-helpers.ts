// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Reading select's `path` param. One grammar covers every shape select can act
// on, so the kind the path parses to picks the target.

import {
  formatObjectPath,
  parseObjectPath,
  pathError,
  type ObjectPath,
  type TrackSegment,
} from "#src/tools/shared/validation/object-path.ts";
import {
  namedHiddenPath,
  namedPath,
} from "#src/tools/shared/validation/object-path-helpers.ts";
import { parseClipSlot } from "./select-id-helpers.ts";
import { type TrackCategory } from "./select-helpers.ts";

export interface PathTarget {
  parsedClipSlot?: { trackIndex: number; sceneIndex: number };
  devicePath?: string;
  /** A drum pad or rack chain path, which selects on its rack rather than the song view. */
  rackTargetPath?: string;
  /** The param devicePath came from, for messages the caller can act on. */
  devicePathParam?: "path" | "devicePath";
  trackIndex?: number;
  category?: TrackCategory;
  sceneIndex?: number;
  /** The track a slot or device path sits on. Live moves the track selection
   * there on its own, so this is only checked against an explicit param —
   * disagreeing would leave the call touching two different tracks. */
  impliedTrack?: ImpliedTrack;
  /** The scene a slot path sits on, checked the same way. */
  impliedScene?: number;
}

/** A track named by a path but not selected from it. `trackIndex` is unset for
 * the master track, which has no index, so any explicit one disagrees. */
interface ImpliedTrack {
  trackIndex?: number;
  category: TrackCategory;
}

/** The params a path can name a second time. */
interface PathAgreementArgs {
  trackIndex?: number;
  trackType?: "return" | "master";
  sceneIndex?: number;
}

interface PathParams extends PathAgreementArgs {
  path?: string;
  slot?: string;
  devicePath?: string;
}

/**
 * Resolve `path` against every param that can name the same thing, refusing to
 * pick when two of them disagree.
 * @param args - The path and selection params as the tool received them
 * @returns The clip slot, device, track, or scene the caller named
 */
export function resolvePath(args: PathParams): PathTarget {
  const fromPath = targetFromParams(args);

  assertPathAgrees(fromPath, args);

  return {
    ...fromPath,
    trackIndex: merge("trackIndex", args.trackIndex, fromPath.trackIndex),
    category: merge("trackType", args.trackType, fromPath.category),
    sceneIndex: merge("sceneIndex", args.sceneIndex, fromPath.sceneIndex),
  };
}

// --- Helpers below main exports ---

/**
 * Read `path` and the two params it replaced as what they name.
 * @param args - The path params as the tool received them
 * @param args.path - The path param
 * @param args.slot - The deprecated session slot
 * @param args.devicePath - The deprecated device path
 * @returns The clip slot, device, track, or scene the caller named
 */
function targetFromParams({
  path: rawPath,
  slot: rawSlot,
  devicePath: rawDevicePath,
}: PathParams): PathTarget {
  const path = namedPath(rawPath);
  const slot = namedHiddenPath(rawSlot);
  const devicePath = namedHiddenPath(rawDevicePath);

  if (path == null) {
    return {
      parsedClipSlot: slot == null ? undefined : parseClipSlot(slot),
      devicePath,
      devicePathParam: devicePath == null ? undefined : "devicePath",
    };
  }

  // Honoring one and dropping the other is the silent-wrong-target bug path
  // replaces, so refuse instead of picking.
  if (slot != null || devicePath != null) {
    throw new Error(
      "select failed: path and slot/devicePath both name a target; use path alone (the others are deprecated)",
    );
  }

  return targetFromPath(parseObjectPath(path, "path"));
}

/**
 * Combine a param with what `path` said, refusing to pick when they disagree —
 * honoring one and dropping the other is the silent wrong-target bug.
 * @param name - Param name, for the error
 * @param explicit - What the caller passed as its own param
 * @param fromPath - What the path named
 * @returns The agreed value, or whichever one was given
 */
function merge<T>(
  name: string,
  explicit: T | undefined,
  fromPath: T | undefined,
): T | undefined {
  if (explicit == null) return fromPath;
  if (fromPath == null || explicit === fromPath) return explicit;

  throw pathConflict(name);
}

/**
 * Refuse a param naming a different track or scene than the one a slot or
 * device path already sits on. These can't be merged like the others — the
 * path doesn't select them, Live moves there on its own — so honoring both
 * would quietly leave two different things selected.
 * @param target - What the path named
 * @param target.impliedTrack - The track the path sits on
 * @param target.impliedScene - The scene the path sits on
 * @param args - The params the caller passed alongside it
 * @param args.trackIndex - The explicit track index
 * @param args.trackType - The explicit track type
 * @param args.sceneIndex - The explicit scene index
 */
function assertPathAgrees(
  { impliedTrack, impliedScene }: PathTarget,
  { trackIndex, trackType, sceneIndex }: PathAgreementArgs,
): void {
  if (impliedTrack != null) {
    if (trackIndex != null && trackIndex !== impliedTrack.trackIndex) {
      throw pathConflict("trackIndex");
    }

    if (trackType != null && trackType !== impliedTrack.category) {
      throw pathConflict("trackType");
    }
  }

  if (
    impliedScene != null &&
    sceneIndex != null &&
    sceneIndex !== impliedScene
  ) {
    throw pathConflict("sceneIndex");
  }
}

/**
 * The one error every path-versus-param disagreement is reported as.
 * @param name - The param that disagreed
 * @returns The error to throw
 */
function pathConflict(name: string): Error {
  return new Error(
    `select failed: path and ${name} name different targets; use path alone`,
  );
}

/**
 * Read a path's track root as a track index and category.
 * @param root - The parsed track root
 * @returns The track it names
 */
function trackFromRoot(root: TrackSegment): ImpliedTrack {
  switch (root.kind) {
    case "track":
      return { trackIndex: root.trackIndex, category: "regular" };
    case "return-track":
      return { trackIndex: root.returnIndex, category: "return" };
    default:
      return { category: "master" };
  }
}

/**
 * Split a device-chain path by what its last segment names: a device, or
 * something inside a rack (a chain, a return chain, or a drum pad).
 * @param path - A parsed device-chain path
 * @returns What select should select
 */
function deviceChainTarget(
  path: Extract<ObjectPath, { kind: "device" }>,
): PathTarget {
  const formatted = formatObjectPath(path);
  const last = path.segments.at(-1);

  return last == null || last.kind === "device"
    ? { devicePath: formatted, devicePathParam: "path" }
    : { rackTargetPath: formatted };
}

/**
 * Map a parsed path onto the target select acts on.
 * @param path - The parsed path
 * @returns What select should select
 */
function targetFromPath(path: ObjectPath): PathTarget {
  switch (path.kind) {
    case "device":
      return {
        ...deviceChainTarget(path),
        impliedTrack: trackFromRoot(path.root),
      };
    case "track":
    case "return-track":
    case "master-track":
      return trackFromRoot(path);
    case "scene":
      return { sceneIndex: path.sceneIndex };
    case "slot":
      return {
        parsedClipSlot: {
          trackIndex: path.trackIndex,
          sceneIndex: path.sceneIndex,
        },
        impliedTrack: { trackIndex: path.trackIndex, category: "regular" },
        impliedScene: path.sceneIndex,
      };
    default:
      throw pathError(
        "path",
        formatObjectPath(path),
        'a take lane is not selectable; select a clip by id, or its track with "t<track>"',
      );
  }
}
