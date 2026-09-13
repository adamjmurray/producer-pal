// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
import {
  type InsertionSpot,
  refuseCountWithPathList,
  repeatForCount,
  validateCount,
} from "#src/tools/shared/validation/lists/insertion-plan.ts";
import { pathEntries } from "#src/tools/shared/validation/helpers/object-paths.ts";
import { parseObjectPath } from "#src/tools/shared/validation/object-path.ts";
import { pathError } from "#src/tools/shared/validation/helpers/object-path-lexer.ts";

export type CreateTrackType = "midi" | "audio" | "return";

export interface CreateTrackTarget {
  /** Which Live call makes the track */
  type: CreateTrackType;
  /** Where it goes; "end" appends */
  spot: InsertionSpot;
}

interface CreateTrackTargetArgs {
  path?: string;
  trackIndex?: number;
  count?: number;
  type?: CreateTrackType;
}

/**
 * Reads where the new tracks go, from the path list or the params it replaced.
 * @param args - The create call's addressing params
 * @param args.path - "t+", "t2", "rt+", comma-separated for several tracks
 * @param args.trackIndex - Deprecated index, -1 or unset to append
 * @param args.count - Deprecated repeat of a single path
 * @param args.type - Which signal a regular track carries
 * @returns One target per track to create, in the order the call named them
 */
export function resolveCreateTrackTargets({
  path,
  trackIndex,
  count,
  type = "midi",
}: CreateTrackTargetArgs): CreateTrackTarget[] {
  const entries = pathEntries(path, "path");

  if (entries.length === 0) {
    validateCount(count);

    return repeatForCount([targetFromIndex(trackIndex, type)], count);
  }

  if (trackIndex != null) {
    throw new Error(
      "path says where the track goes - don't send trackIndex with it",
    );
  }

  refuseCountWithPathList(count, entries.length, "track", "t+,t+,t+");
  validateCount(count);

  return repeatForCount(
    entries.map((entry) => targetFromPath(entry, type)),
    count,
  );
}

// --- Helpers below main exports ---

/**
 * Reads the params the path replaced as a place to put a new track.
 * @param trackIndex - Deprecated index, -1 or unset to append
 * @param type - Which signal the track carries
 * @returns The Live call to make and where to make it
 */
function targetFromIndex(
  trackIndex: number | undefined,
  type: CreateTrackType,
): CreateTrackTarget {
  // A return track is still reachable by the retired spelling, so say what
  // replaced it rather than refusing a call that works.
  if (type === "return") {
    console.warn(
      'type "return" is deprecated and will be removed; use path "rt+" instead',
    );

    return { type: "return", spot: "end" };
  }

  return {
    type,
    spot: trackIndex == null || trackIndex === -1 ? "end" : trackIndex,
  };
}

/**
 * Reads a path as a place to put a new track.
 * @param entry - The path as written
 * @param type - Which signal the track carries, where the path leaves a choice
 * @returns The Live call to make and where to make it
 */
function targetFromPath(
  entry: string,
  type: CreateTrackType,
): CreateTrackTarget {
  const path = parseObjectPath(entry, "path");

  switch (path.kind) {
    // A return track is audio-only and Live appends it, so the path settles
    // both the type and the position on its own.
    case "new-return-track":
      return { type: "return", spot: "end" };
    case "new-track":
      return { type: signalType(type, entry), spot: "end" };
    case "track":
      return { type: signalType(type, entry), spot: path.trackIndex };
    case "return-track":
      throw pathError(
        "path",
        entry,
        'Live adds return tracks at the end, so they have no index; use "rt+"',
      );
    default:
      throw pathError(
        "path",
        entry,
        'it names no place for a track; expected "t+", "t<index>", or "rt+"',
      );
  }
}

/**
 * The signal a new regular track carries. "return" is not one — the path is
 * how a return track is asked for now.
 * @param type - The type param
 * @param entry - The path as written, for the error
 * @returns "midi" or "audio"
 */
function signalType(type: CreateTrackType, entry: string): "midi" | "audio" {
  if (type === "return") {
    throw pathError(
      "path",
      entry,
      'it names a regular track, but type is "return"; use path "rt+" for a return track',
    );
  }

  return type;
}
